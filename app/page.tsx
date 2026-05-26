import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let verification = null
  if (user) {
    const { data } = await supabase
      .from('verifications')
      .select('verified_height_inches, verified_at')
      .eq('user_id', user.id)
      .single()
    verification = data
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-16 bg-white">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600 mb-2">
            <span className="text-white text-2xl font-bold">✓</span>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight">Verified Height</h1>
          <p className="text-lg text-gray-500 leading-relaxed">
            Government ID verified. Accurate to the inch. One time, permanent on your profile.
          </p>
        </div>

        {user && verification ? (
          <div className="space-y-4">
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-6">
              <p className="text-sm text-indigo-600 font-medium uppercase tracking-wide mb-1">Your verified height</p>
              <p className="text-5xl font-bold text-indigo-700">
                {Math.floor(verification.verified_height_inches / 12)}&#39;{verification.verified_height_inches % 12}&quot;
              </p>
              <p className="text-xs text-gray-400 mt-2">
                Verified {new Date(verification.verified_at).toLocaleDateString()}
              </p>
            </div>
            <Link href="/profile" className="block w-full bg-gray-900 text-white py-3 rounded-xl font-semibold hover:bg-gray-800 transition-colors">
              View profile
            </Link>
          </div>
        ) : user ? (
          <Link href="/verify" className="block w-full bg-indigo-600 text-white py-4 rounded-xl font-semibold text-lg hover:bg-indigo-700 transition-colors">
            Get verified
          </Link>
        ) : (
          <div className="space-y-3">
            <Link href="/auth/signup" className="block w-full bg-indigo-600 text-white py-4 rounded-xl font-semibold text-lg hover:bg-indigo-700 transition-colors">
              Get verified
            </Link>
            <Link href="/auth/login" className="block w-full text-gray-500 py-3 text-sm hover:text-gray-700 transition-colors">
              Already have an account? Sign in
            </Link>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 pt-4 text-center">
          {[
            { label: 'Government ID', desc: 'Identity confirmed' },
            { label: 'To the inch', desc: 'Not an estimate' },
            { label: 'One time', desc: 'Permanent badge' },
          ].map(item => (
            <div key={item.label} className="space-y-1">
              <p className="font-semibold text-gray-900 text-sm">{item.label}</p>
              <p className="text-xs text-gray-400">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
