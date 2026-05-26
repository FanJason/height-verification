import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { claimedHeightInches, idHeightInches, verifiedHeightInches } = await req.json()

    if (!claimedHeightInches || !idHeightInches || !verifiedHeightInches) {
      return NextResponse.json({ error: 'Missing height data' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('verifications')
      .upsert({
        user_id: user.id,
        claimed_height_inches: claimedHeightInches,
        id_height_inches: idHeightInches,
        verified_height_inches: verifiedHeightInches,
        status: 'verified',
        verified_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ verification: data })
  } catch (err) {
    console.error('save-verification error:', err)
    return NextResponse.json({ error: 'Failed to save verification' }, { status: 500 })
  }
}
