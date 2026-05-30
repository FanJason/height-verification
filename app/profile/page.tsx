import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { inchesToDisplay } from '@/lib/height-utils'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: verification } = await supabase
    .from('verifications')
    .select('*')
    .eq('user_id', user.id)
    .single()

  async function signOut() {
    'use server'
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/auth/login')
  }

  const displayName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split('@')[0] ||
    'User'

  const avatarUrl = user.user_metadata?.avatar_url || null

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-16 bg-white">
      <div className="max-w-sm w-full space-y-8">
        <div className="text-center space-y-2">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={displayName}
              className="w-20 h-20 rounded-full mx-auto object-cover border-2 border-gray-100"
            />
          ) : (
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-indigo-100 mx-auto text-2xl font-bold text-indigo-600">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <p className="text-lg font-semibold text-gray-900">{displayName}</p>
        </div>

        {verification ? (
          <div className="space-y-4">
            <div className="bg-indigo-600 rounded-3xl p-8 text-center text-white space-y-3 shadow-lg">
              <div className="inline-flex items-center gap-2 bg-white/20 rounded-full px-3 py-1">
                <span className="text-green-300 text-sm font-bold">✓</span>
                <span className="text-sm font-semibold">Government ID Verified</span>
              </div>
              <p className="text-6xl font-bold tracking-tight">
                {inchesToDisplay(verification.verified_height_inches)}
              </p>
              <p className="text-indigo-200 text-sm">
                Verified {new Date(verification.verified_at).toLocaleDateString('en-US', {
                  year: 'numeric', month: 'long', day: 'numeric'
                })}
              </p>
            </div>

            <div className="bg-gray-50 rounded-2xl p-4 space-y-2 text-sm text-gray-500">
              <div className="flex justify-between">
                <span>Method</span>
                <span className="font-medium text-gray-700">Government ID + visual</span>
              </div>
              <div className="flex justify-between">
                <span>Accuracy</span>
                <span className="font-medium text-gray-700">To the inch</span>
              </div>
            </div>

            <p className="text-center text-xs text-gray-300">
              <Link href="/verify" className="hover:text-gray-400 transition-colors">
                Re-verify height
              </Link>
            </p>
          </div>
        ) : (
          <div className="text-center space-y-4">
            <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-8">
              <p className="text-gray-400 text-lg">Not yet verified</p>
              <p className="text-gray-400 text-sm mt-1">Complete verification to get your height badge</p>
            </div>
            <Link
              href="/verify"
              className="block w-full bg-indigo-600 text-white py-4 rounded-xl font-semibold text-lg hover:bg-indigo-700 transition-colors"
            >
              Get verified
            </Link>
          </div>
        )}

        <form action={signOut}>
          <button type="submit" className="w-full text-gray-400 text-sm hover:text-gray-600 transition-colors py-2">
            Sign out
          </button>
        </form>
      </div>
    </main>
  )
}
