'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const FEET_OPTIONS = [4, 5, 6, 7]
const INCH_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

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
      <div className="max-w-sm w-full space-y-8">
        <div className="text-center space-y-2">
          <p className="text-sm font-medium text-indigo-600 uppercase tracking-widest">Step 1 of 3</p>
          <h1 className="text-3xl font-bold text-gray-900">What&#39;s your height?</h1>
          <p className="text-gray-500">Enter your height exactly as it appears on your ID</p>
        </div>

        <div className="flex gap-4 justify-center">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2 text-center">Feet</label>
            <select
              value={feet}
              onChange={e => setFeet(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-xl px-4 py-4 text-2xl font-bold text-center text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none bg-white"
            >
              {FEET_OPTIONS.map(f => (
                <option key={f} value={f}>{f}&#39;</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2 text-center">Inches</label>
            <select
              value={inches}
              onChange={e => setInches(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-xl px-4 py-4 text-2xl font-bold text-center text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none bg-white"
            >
              {INCH_OPTIONS.map(i => (
                <option key={i} value={i}>{i}&quot;</option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-gray-50 rounded-2xl p-4 text-center">
          <p className="text-5xl font-bold text-gray-900">{feet}&#39;{inches}&quot;</p>
          <p className="text-sm text-gray-400 mt-1">{feet * 12 + inches} inches total</p>
        </div>

        <button
          onClick={handleContinue}
          className="w-full bg-indigo-600 text-white py-4 rounded-xl font-semibold text-lg hover:bg-indigo-700 transition-colors"
        >
          Continue
        </button>
      </div>
    </main>
  )
}
