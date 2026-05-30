'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { inchesToDisplay, heightsMatch } from '@/lib/height-utils'

type Phase =
  | 'starting'     // requesting camera
  | 'scanning'     // live detection running
  | 'detected'     // ID found, holding countdown
  | 'capturing'    // grabbing final frame
  | 'analyzing'    // sending to verify-id
  | 'success'
  | 'mismatch'
  | 'invalid'
  | 'error'
  | 'denied'       // camera permission denied

const DETECTION_INTERVAL_MS = 1500
const HOLD_FRAMES_REQUIRED = 1  // single good detection triggers capture
const HOLD_COUNTDOWN_MS = 1200  // visual countdown duration
const MANUAL_FALLBACK_MS = 20000 // show manual button after this long

export default function IDScanPage() {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const detectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const consecutiveGoodRef = useRef(0)

  const [phase, setPhase] = useState<Phase>('starting')
  const [feedback, setFeedback] = useState('Position your ID in the frame')
  const [holdProgress, setHoldProgress] = useState(0)   // 0–100
  const [idReady, setIdReady] = useState(false)          // green border
  const [idHeight, setIdHeight] = useState<number | null>(null)
  const [claimed, setClaimed] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [showManualButton, setShowManualButton] = useState(false)
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment')
  const scanStartRef = useRef<number>(0)

  useEffect(() => {
    setClaimed(Number(sessionStorage.getItem('claimed_height_inches') || 0))
  }, [])

  const stopCamera = useCallback(() => {
    if (detectionTimerRef.current) clearTimeout(detectionTimerRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
  }, [])

  // Capture current video frame as base64 JPEG
  const captureFrame = useCallback((quality = 0.85): string | null => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) return null

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    return canvas.toDataURL('image/jpeg', quality)
  }, [])

  // Start live camera
  useEffect(() => {
    let cancelled = false

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        setPhase('scanning')
      } catch (err: unknown) {
        if (cancelled) return
        const name = err instanceof Error ? err.name : ''
        setPhase(name === 'NotAllowedError' ? 'denied' : 'error')
        setErrorMsg('Could not access camera. Please allow camera access and try again.')
      }
    }

    startCamera()
    return () => { cancelled = true; stopCamera() }
  }, [stopCamera])

  // Show manual capture button after timeout
  useEffect(() => {
    if (phase !== 'scanning') return
    scanStartRef.current = Date.now()
    const t = setTimeout(() => setShowManualButton(true), MANUAL_FALLBACK_MS)
    return () => clearTimeout(t)
  }, [phase])

  // Detection loop — runs while in 'scanning' phase
  useEffect(() => {
    if (phase !== 'scanning') return

    async function runDetection() {
      const frame = captureFrame(0.7)
      if (!frame) {
        detectionTimerRef.current = setTimeout(runDetection, DETECTION_INTERVAL_MS)
        return
      }

      try {
        const res = await fetch('/api/detect-id', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: frame }),
        })
        const data = await res.json()

        setFeedback(data.feedback || 'Position your ID in the frame')
        setIdReady(false)

        if (data.detected && data.fullyVisible && data.legible) {
          consecutiveGoodRef.current += 1
          if (consecutiveGoodRef.current >= HOLD_FRAMES_REQUIRED) {
            // Trigger capture sequence
            setIdReady(true)
            setPhase('detected')
            return
          }
        } else {
          consecutiveGoodRef.current = 0
        }
      } catch {
        // network blip — keep scanning
      }

      detectionTimerRef.current = setTimeout(runDetection, DETECTION_INTERVAL_MS)
    }

    // Small initial delay so camera has time to focus
    detectionTimerRef.current = setTimeout(runDetection, 800)

    return () => {
      if (detectionTimerRef.current) clearTimeout(detectionTimerRef.current)
    }
  }, [phase, captureFrame])

  // Countdown then auto-capture
  useEffect(() => {
    if (phase !== 'detected') return

    setIdReady(true)
    setFeedback('Hold still…')
    setHoldProgress(0)

    const start = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - start
      const pct = Math.min((elapsed / HOLD_COUNTDOWN_MS) * 100, 100)
      setHoldProgress(pct)
      if (elapsed >= HOLD_COUNTDOWN_MS) {
        clearInterval(interval)
        setPhase('capturing')
      }
    }, 30)

    return () => clearInterval(interval)
  }, [phase])

  // Final high-quality capture and verify
  useEffect(() => {
    if (phase !== 'capturing') return

    async function verifyCapture() {
      const frame = captureFrame(0.95)
      if (!frame) { setPhase('error'); setErrorMsg('Could not capture image.'); return }

      stopCamera()
      setPhase('analyzing')

      try {
        const res = await fetch('/api/verify-id', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: frame }),
        })
        const data = await res.json()

        if (!data.isValidId) { setPhase('invalid'); return }
        if (!data.heightVisible || !data.heightInches) {
          setErrorMsg('Height field could not be read. Make sure the front of your ID is clearly visible.')
          setPhase('error')
          return
        }

        setIdHeight(data.heightInches)
        sessionStorage.setItem('id_height_inches', String(data.heightInches))

        if (heightsMatch(claimed, data.heightInches, 0)) {
          sessionStorage.setItem('verified_height_inches', String(data.heightInches))
          setPhase('success')
        } else {
          setPhase('mismatch')
        }
      } catch {
        setErrorMsg('Something went wrong. Please try again.')
        setPhase('error')
      }
    }

    verifyCapture()
  }, [phase, captureFrame, stopCamera, claimed])

  function retry() {
    consecutiveGoodRef.current = 0
    setIdReady(false)
    setHoldProgress(0)
    setShowManualButton(false)
    setFeedback('Position your ID in the frame')
    setPhase('scanning')

    // Restart camera if it was stopped
    if (!streamRef.current?.active) {
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: cameraFacing, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      }).then(stream => {
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
        }
      })
    }
  }

  function flipCamera() {
    if (phase !== 'scanning' && phase !== 'detected') return
    const newFacing = cameraFacing === 'environment' ? 'user' : 'environment'
    setCameraFacing(newFacing)
    streamRef.current?.getTracks().forEach(t => t.stop())
    consecutiveGoodRef.current = 0
    setIdReady(false)
    setHoldProgress(0)
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: newFacing, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    }).then(stream => {
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
    })
  }

  // ─── Result screens ───────────────────────────────────────────────────────

  if (phase === 'denied') {
    return (
      <ResultScreen icon="🔒" title="Camera access needed">
        <p className="text-gray-500 text-sm text-center">
          Go to your phone settings and allow camera access for this site, then refresh.
        </p>
      </ResultScreen>
    )
  }

  if (phase === 'analyzing') {
    return (
      <ResultScreen icon={<Spinner />} title="Reading your ID…">
        <p className="text-gray-400 text-sm text-center">This takes a few seconds</p>
      </ResultScreen>
    )
  }

  if (phase === 'success' && idHeight) {
    return (
      <ResultScreen icon="✅" title="ID verified">
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 w-full text-center">
          <p className="text-green-700 font-semibold">ID reads {inchesToDisplay(idHeight)}</p>
          <p className="text-green-600 text-sm mt-1">Matches your claimed height ✓</p>
        </div>
        <button
          onClick={() => router.push('/verify/liveness')}
          className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-semibold text-lg active:bg-indigo-800 transition-colors"
        >
          Continue to live check
        </button>
      </ResultScreen>
    )
  }

  if (phase === 'mismatch' && idHeight) {
    return (
      <ResultScreen icon="⚠️" title="Height mismatch">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 w-full">
          <div className="grid grid-cols-2 gap-2 text-sm text-center">
            <div>
              <p className="text-gray-500">You claimed</p>
              <p className="font-bold text-gray-900">{claimed ? inchesToDisplay(claimed) : '—'}</p>
            </div>
            <div>
              <p className="text-gray-500">ID shows</p>
              <p className="font-bold text-red-700">{inchesToDisplay(idHeight)}</p>
            </div>
          </div>
          <p className="text-red-600 text-xs text-center mt-3">
            Must match within 1 inch. Go back and correct your claimed height.
          </p>
        </div>
        <button onClick={() => router.push('/verify')} className="w-full border border-gray-300 text-gray-700 py-3 rounded-2xl font-medium active:bg-gray-50 transition-colors">
          Fix claimed height
        </button>
      </ResultScreen>
    )
  }

  if (phase === 'invalid') {
    return (
      <ResultScreen icon="🪪" title="Not a valid ID">
        <p className="text-gray-500 text-sm text-center">Use a driver&apos;s license or state ID and make sure the front is facing the camera.</p>
        <button onClick={retry} className="w-full bg-indigo-600 text-white py-3 rounded-2xl font-semibold active:bg-indigo-800 transition-colors">Try again</button>
      </ResultScreen>
    )
  }

  if (phase === 'error') {
    return (
      <ResultScreen icon="❌" title="Something went wrong">
        <p className="text-gray-500 text-sm text-center">{errorMsg}</p>
        <button onClick={retry} className="w-full bg-indigo-600 text-white py-3 rounded-2xl font-semibold active:bg-indigo-800 transition-colors">Try again</button>
      </ResultScreen>
    )
  }

  // ─── Live scanner UI ──────────────────────────────────────────────────────

  const isReady = idReady || phase === 'detected'

  return (
    <div className="relative w-full bg-black overflow-hidden" style={{ height: '100dvh' }}>
      {/* Live camera feed */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 w-full h-full object-cover"
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* Dark overlay with cutout */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 h-[20%] bg-black/60" />
        {/* Bottom bar */}
        <div className="absolute bottom-0 left-0 right-0 h-[30%] bg-black/60" />
        {/* Left bar */}
        <div className="absolute left-0 bg-black/60" style={{ top: '20%', bottom: '30%', width: '5%' }} />
        {/* Right bar */}
        <div className="absolute right-0 bg-black/60" style={{ top: '20%', bottom: '30%', width: '5%' }} />

        {/* ID guide frame */}
        <div
          className="absolute transition-all duration-300"
          style={{ top: '20%', bottom: '30%', left: '5%', right: '5%' }}
        >
          {/* Corner marks */}
          {[
            'top-0 left-0 border-t-4 border-l-4 rounded-tl-lg',
            'top-0 right-0 border-t-4 border-r-4 rounded-tr-lg',
            'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-lg',
            'bottom-0 right-0 border-b-4 border-r-4 rounded-br-lg',
          ].map((cls, i) => (
            <div
              key={i}
              className={`absolute w-8 h-8 transition-colors duration-300 ${cls} ${isReady ? 'border-green-400' : 'border-white'}`}
            />
          ))}

          {/* Hold-still progress bar */}
          {(phase === 'detected') && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-400 transition-all duration-75 rounded-full"
                style={{ width: `${holdProgress}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Top header */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center gap-4 px-6"
        style={{ paddingTop: 'max(48px, calc(env(safe-area-inset-top, 0px) + 12px))', paddingBottom: '12px' }}
      >
        <button
          onClick={() => { stopCamera(); router.push('/verify') }}
          className="text-white/80 active:text-white transition-colors text-sm font-medium flex-shrink-0"
        >
          ← Back
        </button>
        <div className="flex-1 text-center">
          <p className="text-white/60 text-xs uppercase tracking-widest">Step 2 of 3</p>
          <p className="text-white font-semibold text-sm mt-0.5">Scan the front of your photo ID</p>
        </div>
        <button
          onClick={flipCamera}
          className="text-white/80 active:text-white transition-colors flex-shrink-0 w-12 flex justify-end"
          aria-label="Flip camera"
        >
          <FlipCameraIcon />
        </button>
      </div>

      {/* Privacy notice */}
      <div className="absolute left-0 right-0 px-6" style={{ top: 'max(100px, calc(env(safe-area-inset-top, 0px) + 64px))' }}>
        <div className="bg-black/50 backdrop-blur-sm rounded-xl px-4 py-2 mx-auto max-w-xs">
          <p className="text-white/80 text-xs text-center">
            🔒 Your ID is <strong>never stored</strong> — processed temporarily to read your height only
          </p>
        </div>
      </div>

      {/* Status feedback */}
      <div
        className="absolute bottom-0 left-0 right-0 px-6"
        style={{ paddingBottom: 'max(48px, calc(env(safe-area-inset-bottom, 0px) + 20px))' }}
      >
        <div className="text-center space-y-3">
          {phase === 'starting' && (
            <div className="flex items-center justify-center gap-2">
              <Spinner white />
              <p className="text-white font-medium">Starting camera…</p>
            </div>
          )}

          {(phase === 'scanning' || phase === 'detected') && (
            <>
              <p className={`text-lg font-semibold transition-colors duration-300 ${isReady ? 'text-green-400' : 'text-white'}`}>
                {feedback}
              </p>
              {!isReady && (
                <p className="text-white/50 text-sm">
                  Hold your ID so all edges are inside the frame
                </p>
              )}
              {showManualButton && !isReady && (
                <button
                  onClick={() => setPhase('detected')}
                  className="mt-2 bg-white/20 backdrop-blur-sm text-white text-sm font-semibold px-5 py-2 rounded-full border border-white/30 hover:bg-white/30 transition-colors"
                >
                  Capture manually
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Helper components ────────────────────────────────────────────────────────

function ResultScreen({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <main className="flex flex-col items-center justify-center px-6 bg-white" style={{ minHeight: '100dvh' }}>
      <div className="max-w-sm w-full space-y-6 text-center py-12">
        <div className="text-5xl">{icon}</div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {children}
      </div>
    </main>
  )
}

function Spinner({ white }: { white?: boolean }) {
  return (
    <div className={`w-5 h-5 border-2 rounded-full animate-spin ${white ? 'border-white border-t-transparent' : 'border-gray-400 border-t-transparent'}`} />
  )
}

function FlipCameraIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 7h-3a2 2 0 0 0-2-2h-6a2 2 0 0 0-2 2H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/>
      <circle cx="12" cy="13" r="3"/>
      <path d="M9.5 3L7 5.5 9.5 8M14.5 3L17 5.5 14.5 8"/>
    </svg>
  )
}
