'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const FEET = [4, 5, 6, 7]
const INCHES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const ITEM_H = 60

interface WheelPickerProps {
  items: number[]
  initial: number
  onChange: (v: number) => void
  formatItem: (v: number) => string
}

function WheelPicker({ items, initial, onChange, formatItem }: WheelPickerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const centerIdxRef = useRef(Math.max(0, items.indexOf(initial)))
  const [centerIdx, setCenterIdx] = useState(centerIdxRef.current)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const idx = Math.max(0, items.indexOf(initial))
    requestAnimationFrame(() => {
      el.scrollTop = idx * ITEM_H
      centerIdxRef.current = idx
      setCenterIdx(idx)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleScroll() {
    const el = ref.current
    if (!el) return
    const idx = Math.round(el.scrollTop / ITEM_H)
    const clamped = Math.max(0, Math.min(items.length - 1, idx))
    if (clamped !== centerIdxRef.current) {
      centerIdxRef.current = clamped
      setCenterIdx(clamped)
      onChangeRef.current(items[clamped])
    }
  }

  return (
    <div className="relative flex-1 overflow-hidden" style={{ height: ITEM_H * 5 }}>
      {/* top fade */}
      <div
        className="absolute inset-x-0 top-0 z-10 pointer-events-none"
        style={{ height: ITEM_H * 2, background: 'linear-gradient(to bottom, white 20%, transparent)' }}
      />
      {/* bottom fade */}
      <div
        className="absolute inset-x-0 bottom-0 z-10 pointer-events-none"
        style={{ height: ITEM_H * 2, background: 'linear-gradient(to top, white 20%, transparent)' }}
      />
      <div
        ref={ref}
        onScroll={handleScroll}
        className="no-scrollbar overflow-y-scroll h-full"
        style={{
          scrollSnapType: 'y mandatory',
          paddingTop: ITEM_H * 2,
          paddingBottom: ITEM_H * 2,
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {items.map((v, i) => {
          const dist = Math.abs(i - centerIdx)
          return (
            <div
              key={v}
              style={{ scrollSnapAlign: 'center', height: ITEM_H }}
              className="flex items-center justify-center select-none touch-manipulation"
            >
              <span
                style={{
                  fontSize: dist === 0 ? 34 : dist === 1 ? 24 : 18,
                  fontWeight: dist === 0 ? 700 : dist === 1 ? 400 : 300,
                  color: dist === 0 ? '#111827' : dist === 1 ? '#9ca3af' : '#d1d5db',
                  transition: 'font-size 0.12s ease, color 0.12s ease',
                  lineHeight: 1,
                }}
              >
                {formatItem(v)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function ClaimHeightPage() {
  const router = useRouter()
  const [feet, setFeet] = useState(5)
  const [inches, setInches] = useState(10)

  function handleContinue() {
    const totalInches = feet * 12 + inches
    sessionStorage.setItem('claimed_height_inches', String(totalInches))
    router.push('/verify/id-scan')
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 bg-white">
      <div className="w-full max-w-sm space-y-8">

        <div className="text-center space-y-1">
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest">Step 1 of 3</p>
          <h1 className="text-3xl font-bold text-gray-900">What&apos;s your height?</h1>
          <p className="text-gray-400 text-sm">Scroll to your exact height</p>
        </div>

        {/* Wheels */}
        <div className="flex gap-4 items-start">
          <div className="flex-1 flex flex-col items-center gap-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Feet</p>
            <div className="w-full">
              <WheelPicker
                items={FEET}
                initial={5}
                onChange={setFeet}
                formatItem={(v) => `${v}′`}
              />
            </div>
          </div>
          <div className="flex-1 flex flex-col items-center gap-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Inches</p>
            <div className="w-full">
              <WheelPicker
                items={INCHES}
                initial={10}
                onChange={setInches}
                formatItem={(v) => `${v}″`}
              />
            </div>
          </div>
        </div>

        {/* Selected height display */}
        <div className="text-center py-2">
          <p className="text-6xl font-bold text-gray-900 tracking-tight">
            {feet}&apos;{inches}&quot;
          </p>
          <p className="text-sm text-gray-400 mt-2">{Math.round((feet * 12 + inches) * 2.54)} cm</p>
        </div>

        <button
          onClick={handleContinue}
          className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-semibold text-lg active:bg-indigo-800 transition-colors"
        >
          Continue
        </button>
      </div>
    </main>
  )
}
