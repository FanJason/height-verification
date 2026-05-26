import { createClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: verification } = await supabase
        .from('verifications')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (verification) {
        return NextResponse.redirect(`${origin}/profile`)
      }
    }
  }

  // New user or no verification yet — start the flow
  return NextResponse.redirect(`${origin}/verify`)
}
