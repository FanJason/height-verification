'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { inchesToDisplay, heightsMatch } from '@/lib/height-utils'

type Phase =
  | 'starting'
  | 'positioning'
  | 'ready'
  | 'countdown'
  | 'capturing'
  | 'analyzing'
  | 'result_ok'
  | 'result_mismatch'
  | 'saving'
  | 'done'
  | 'error'

const COUNTDOWN_SEC = 3
const READY_HOLD_MS = 1500
const NOSE = 0
const LEFT_HEEL = 29, RIGHT_HEEL = 30
const LEFT_FOOT = 31, RIGHT_FOOT = 32
const VIS = 0.55

export default function HeightVerificationPage() {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const detectorRef = useRef<unknown>(null)
  const rafRef = useRef<number>(0)
  const goodPoseStartRef = useRef<number | null>(null)

  const [phase, setPhase] = useState<Phase>('starting')
  const [feedback, setFeedback] = useState('Starting camera…')
  const [poseOk, setPoseOk] = useState(false)
  const [countdown, setCountdown] = useState(COUNTDOWN_SEC)
  const [holdPct, setHoldPct] = useState(0)
  const [visualHeightIn, setVisualHeightIn] = useState<number | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [idHeight, setIdHeight] = useState(0)
  const [verifiedHeight, setVerifiedHeight] = useState(0)

  // Separate loading state so camera shows before MediaPipe is ready
  const [cameraReady, setCameraReady] = useState(false)
  const [modelReady, setModelReady] = useState(false)
  const [modelFailed, setModelFailed] = useState(false)
  const [loadingStatus, setLoadingStatus] = useState('Starting camera…')

  useEffect(() => {
    setIdHeight(Number(sessionStorage.getItem('id_height_inches') || 0))
    setVerifiedHeight(Number(sessionStorage.getItem('verified_height_inches') || 0))
  }, [])

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
  }, [])

  const captureFrame = useCallback((quality = 0.92): string | null => {
    const v = videoRef.current, c = canvasRef.current
    if (!v || !c || v.readyState < 2) return null
    c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d')?.drawImage(v, 0, 0)
    return c.toDataURL('image/jpeg', quality)
  }, [])

  // Start camera immediately (independent of MediaPipe)
  useEffect(() => {
    let cancelled = false

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        setCameraReady(true)
        setLoadingStatus('Loading pose detection…')
      } catch (err) {
        if (!cancelled) {
          setErrorMsg('Camera access failed. Please allow camera access and try again.')
          setPhase('error')
        }
        console.error(err)
      }
    }

    startCamera()
    return () => { cancelled = true; stopCamera() }
  }, [stopCamera])

  // Load MediaPipe in parallel (independent of camera)
  useEffect(() => {
    let cancelled = false

    async function loadPose() {
      try {
        const { PoseLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')
        const resolver = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm'
        )
        const detector = await PoseLandmarker.createFromOptions(resolver, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 3,
        })
        if (cancelled) return
        detectorRef.current = detector
        setModelReady(true)
      } catch (err) {
        if (!cancelled) {
          console.warn('MediaPipe failed to load, falling back to manual capture:', err)
          setModelFailed(true)
        }
      }
    }

    loadPose()
    return () => { cancelled = true }
  }, [])

  // Transition to positioning once camera + (model or fallback) are ready
  useEffect(() => {
    if (phase !== 'starting') return
    if (!cameraReady) return
    if (!modelReady && !modelFailed) return

    setPhase('positioning')
    if (modelFailed) {
      setFeedback('Stand with your full body in frame, then tap Capture')
    } else {
      setFeedback('Step back so your full body fits in frame')
    }
  }, [cameraReady, modelReady, modelFailed, phase])

  // Pose detection loop
  useEffect(() => {
    if (phase !== 'positioning' && phase !== 'ready') return

    // No MediaPipe — allow manual capture immediately
    if (!detectorRef.current) {
      setPoseOk(true)
      setPhase('ready')
      setFeedback('Hold your ID card flat against your chest')
      return
    }

    let lastTs = -1

    function detect(now: number) {
      rafRef.current = requestAnimationFrame(detect)
      if (!videoRef.current || !detectorRef.current) return
      if (now === lastTs) return
      lastTs = now

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (detectorRef.current as any).detectForVideo(videoRef.current, now)

      if (result?.landmarks?.length > 1) {
        setPoseOk(false)
        goodPoseStartRef.current = null
        setHoldPct(0)
        setFeedback('Only one person should be in frame')
        return
      }

      const lm = result?.landmarks?.[0]

      if (!lm) {
        setPoseOk(false)
        goodPoseStartRef.current = null
        setHoldPct(0)
        setFeedback('Step back so your full body fits in frame')
        return
      }

      const headOk = lm[NOSE]?.visibility > VIS
      const feetOk = (lm[LEFT_HEEL]?.visibility > VIS || lm[RIGHT_HEEL]?.visibility > VIS) &&
                     (lm[LEFT_FOOT]?.visibility > VIS || lm[RIGHT_FOOT]?.visibility > VIS)

      const noseY = lm[NOSE]?.y ?? 0.5
      const heelY = Math.max(lm[LEFT_HEEL]?.y ?? 0, lm[RIGHT_HEEL]?.y ?? 0, lm[LEFT_FOOT]?.y ?? 0, lm[RIGHT_FOOT]?.y ?? 0)
      const bodyFraction = heelY - noseY

      if (!headOk) {
        goodPoseStartRef.current = null; setHoldPct(0); setPoseOk(false)
        setFeedback('Step back — can\'t see the top of your head')
        return
      }
      if (!feetOk) {
        goodPoseStartRef.current = null; setHoldPct(0); setPoseOk(false)
        setFeedback('Step back until your feet are visible')
        return
      }
      if (bodyFraction < 0.55) {
        goodPoseStartRef.current = null; setHoldPct(0); setPoseOk(false)
        setFeedback('Step a bit closer to fill the frame')
        return
      }

      setPoseOk(true)
      if (!goodPoseStartRef.current) goodPoseStartRef.current = now
      const held = now - goodPoseStartRef.current
      const pct = Math.min((held / READY_HOLD_MS) * 100, 100)
      setHoldPct(pct)
      setFeedback('Hold your ID card flat against your chest — hold still')

      if (held >= READY_HOLD_MS && phase === 'positioning') {
        setPhase('ready')
      }
    }

    rafRef.current = requestAnimationFrame(detect)
    return () => cancelAnimationFrame(rafRef.current)
  }, [phase])

  // Countdown
  useEffect(() => {
    if (phase !== 'countdown') return
    setCountdown(COUNTDOWN_SEC)
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(interval); setPhase('capturing'); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [phase])

  // Capture + analyze
  useEffect(() => {
    if (phase !== 'capturing') return

    async function analyze() {
      const frame = captureFrame(0.95)
      if (!frame) { setErrorMsg('Capture failed.'); setPhase('error'); return }
      stopCamera()
      setPhase('analyzing')

      try {
        const res = await fetch('/api/verify-height-visual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: frame }),
        })
        const data = await res.json()

        if (!data.singlePerson) {
          setErrorMsg('Only one person should be in frame. Please try again alone.')
          setPhase('error')
          return
        }
        if (!data.cameraParallel) {
          setErrorMsg('Stand facing the camera straight on — not at an angle.')
          setPhase('error')
          return
        }
        if (!data.fullBodyVisible || !data.cardVisible) {
          setErrorMsg(data.feedback || 'Could not detect your full body and ID card clearly. Please try again.')
          setPhase('error')
          return
        }

        const estimatedH = data.estimatedHeightInches
        if (!estimatedH) { setErrorMsg('Could not estimate height from the image.'); setPhase('error'); return }

        setVisualHeightIn(estimatedH)

        const idH = Number(sessionStorage.getItem('id_height_inches'))
        if (heightsMatch(estimatedH, idH, 3)) {
          sessionStorage.setItem('verified_height_inches', String(idH))
          setVerifiedHeight(idH)
          setPhase('result_ok')
        } else {
          setPhase('result_mismatch')
        }
      } catch {
        setErrorMsg('Something went wrong. Please try again.')
        setPhase('error')
      }
    }

    analyze()
  }, [phase, captureFrame, stopCamera])

  async function saveVerification() {
    setPhase('saving')
    try {
      const res = await fetch('/api/save-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claimedHeightInches: Number(sessionStorage.getItem('claimed_height_inches')),
          idHeightInches: Number(sessionStorage.getItem('id_height_inches')),
          verifiedHeightInches: Number(sessionStorage.getItem('verified_height_inches')),
        }),
      })
      if (!res.ok) throw new Error()
      setPhase('done')
    } catch {
      setErrorMsg('Could not save. Please try again.')
      setPhase('error')
    }
  }

  function retry() {
    setPoseOk(false); setHoldPct(0); goodPoseStartRef.current = null
    setVisualHeightIn(null); setErrorMsg('')
    setModelFailed(false); setModelReady(false); setCameraReady(false)
    setLoadingStatus('Starting camera…')
    setPhase('starting')
  }

  // ─── Non-camera screens ───────────────────────────────────────────────────

  if (phase === 'done') {
    return (
      <Screen>
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 mx-auto">
          <span className="text-green-600 text-4xl">✓</span>
        </div>
        <h1 className="text-3xl font-bold text-gray-900">Verified!</h1>
        <p className="text-5xl font-bold text-indigo-600">{inchesToDisplay(verifiedHeight)}</p>
        <p className="text-gray-500">Your height is permanently verified on your account.</p>
        <button
          onClick={() => router.push('/profile')}
          className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-semibold text-lg active:bg-indigo-800 transition-colors"
        >
          View my profile
        </button>
      </Screen>
    )
  }

  if (phase === 'saving') {
    return (
      <Screen>
        <Spinner />
        <p className="text-gray-600 font-medium">Saving verification…</p>
      </Screen>
    )
  }

  if (phase === 'analyzing') {
    return (
      <Screen>
        <Spinner />
        <p className="text-gray-600 font-medium text-lg">Measuring your height…</p>
        <p className="text-gray-400 text-sm">Comparing ID card proportions to full body</p>
      </Screen>
    )
  }

  if (phase === 'result_ok' && visualHeightIn) {
    return (
      <Screen>
        <div className="text-5xl">📏</div>
        <h1 className="text-2xl font-bold text-gray-900">Height confirmed</h1>
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 w-full space-y-2 text-sm">
          <Row label="Government ID" value={inchesToDisplay(idHeight)} />
          <Row label="Visual" value={inchesToDisplay(visualHeightIn)} />
          <div className="border-t border-green-200 pt-2">
            <Row label="Match" value={`±${Math.abs(visualHeightIn - idHeight)}″ ✓`} green />
          </div>
        </div>
        <button
          onClick={saveVerification}
          className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-semibold text-lg active:bg-indigo-800 transition-colors"
        >
          Save verification
        </button>
      </Screen>
    )
  }

  if (phase === 'result_mismatch' && visualHeightIn) {
    return (
      <Screen>
        <div className="text-5xl">⚠️</div>
        <h1 className="text-2xl font-bold text-gray-900">Height mismatch</h1>
        <p className="text-gray-500 text-sm text-center">Visual measurement is more than 3 inches from your ID height.</p>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 w-full space-y-2 text-sm">
          <Row label="Government ID" value={inchesToDisplay(idHeight)} />
          <Row label="Visual measurement" value={inchesToDisplay(visualHeightIn)} red />
          <div className="border-t border-red-200 pt-2">
            <Row label="Difference" value={`${Math.abs(visualHeightIn - idHeight)}″ off`} red />
          </div>
        </div>
        <p className="text-xs text-gray-400 text-center">Hold the ID flat against your chest and stand 5–6 ft from camera.</p>
        <button
          onClick={retry}
          className="w-full bg-indigo-600 text-white py-3 rounded-2xl font-semibold active:bg-indigo-800 transition-colors"
        >
          Try again
        </button>
      </Screen>
    )
  }

  if (phase === 'error') {
    return (
      <Screen>
        <div className="text-5xl">❌</div>
        <p className="text-gray-700 font-medium text-center">{errorMsg}</p>
        <button
          onClick={retry}
          className="w-full bg-indigo-600 text-white py-3 rounded-2xl font-semibold active:bg-indigo-800 transition-colors"
        >
          Try again
        </button>
      </Screen>
    )
  }

  // ─── Live camera UI ───────────────────────────────────────────────────────
  return (
    <div className="relative w-full bg-black overflow-hidden" style={{ height: '100dvh' }}>
      <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 w-full h-full object-cover" />
      <canvas ref={canvasRef} className="hidden" />

      {/* Header */}
      <div
        className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent"
        style={{ paddingTop: 'max(48px, calc(env(safe-area-inset-top, 0px) + 12px))', paddingBottom: '20px', paddingLeft: '24px', paddingRight: '24px' }}
      >
        <div className="text-center space-y-1">
          <p className="text-white/60 text-xs uppercase tracking-widest">Step 3 of 3 — Height Check</p>
          <p className={`text-sm font-semibold transition-colors duration-300 ${poseOk ? 'text-green-400' : 'text-white'}`}>
            {phase === 'starting' ? loadingStatus : feedback}
          </p>
        </div>
      </div>

      {/* Hold-still progress bar */}
      {(phase === 'positioning' || phase === 'ready') && poseOk && !!detectorRef.current && (
        <div className="absolute left-8 right-8" style={{ top: 'max(100px, calc(env(safe-area-inset-top, 0px) + 64px))' }}>
          <div className="h-1 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-green-400 rounded-full transition-all duration-100" style={{ width: `${holdPct}%` }} />
          </div>
        </div>
      )}

      {/* Card guide — chest area */}
      {(phase === 'ready' || phase === 'countdown') && (
        <div className="absolute inset-0 flex items-start justify-center pointer-events-none" style={{ paddingTop: '38%' }}>
          <div style={{ width: '22vw', aspectRatio: '85.6 / 54' }} className="relative">
            {['top-0 left-0 border-t-2 border-l-2', 'top-0 right-0 border-t-2 border-r-2',
              'bottom-0 left-0 border-b-2 border-l-2', 'bottom-0 right-0 border-b-2 border-r-2'].map((c, i) => (
              <div key={i} className={`absolute w-4 h-4 border-white rounded ${c}`} />
            ))}
            <p className="absolute -top-5 left-1/2 -translate-x-1/2 text-white/70 text-xs whitespace-nowrap">ID card here</p>
          </div>
        </div>
      )}

      {/* Bottom controls */}
      <div
        className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent"
        style={{ paddingBottom: 'max(48px, calc(env(safe-area-inset-bottom, 0px) + 20px))', paddingLeft: '24px', paddingRight: '24px', paddingTop: '40px' }}
      >
        {phase === 'starting' && (
          <div className="flex justify-center gap-3 items-center">
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <p className="text-white text-sm">{loadingStatus}</p>
          </div>
        )}
        {phase === 'positioning' && !poseOk && !modelFailed && (
          <p className="text-white/60 text-sm text-center">Stand with your full body in frame</p>
        )}
        {phase === 'positioning' && modelFailed && (
          <button
            onClick={() => setPhase('countdown')}
            className="w-full bg-white text-gray-900 py-4 rounded-2xl font-semibold text-lg active:bg-gray-100 transition-colors"
          >
            Capture height
          </button>
        )}
        {phase === 'ready' && (
          <button
            onClick={() => setPhase('countdown')}
            className="w-full bg-white text-gray-900 py-4 rounded-2xl font-semibold text-lg active:bg-gray-100 transition-colors"
          >
            Capture height
          </button>
        )}
        {phase === 'countdown' && (
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center mx-auto">
              <span className="text-white text-3xl font-bold">{countdown}</span>
            </div>
            <p className="text-white font-medium">Hold still — ID flat against chest</p>
          </div>
        )}
      </div>

      <button
        onClick={() => { stopCamera(); router.push('/verify/id-scan') }}
        className="absolute z-10 text-white/70 active:text-white text-sm"
        style={{ top: 'max(16px, env(safe-area-inset-top, 0px))', left: '16px' }}
      >
        ← Back
      </button>
    </div>
  )
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 bg-white">
      <div className="max-w-sm w-full space-y-5 text-center">{children}</div>
    </main>
  )
}

function Row({ label, value, green, red }: { label: string; value: string; green?: boolean; red?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={`font-semibold ${green ? 'text-green-700' : red ? 'text-red-700' : 'text-gray-900'}`}>{value}</span>
    </div>
  )
}

function Spinner() {
  return <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
}
