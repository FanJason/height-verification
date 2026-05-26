/**
 * Generates an Apple Sign In client_secret JWT for Supabase.
 * Run: node generate-apple-secret.mjs
 *
 * You need:
 *   - TEAM_ID       — top-right of your Apple Developer account
 *   - KEY_ID        — the ID of the key you created (shown in Keys list)
 *   - CLIENT_ID     — your Services ID identifier (e.g. com.yourapp.signin)
 *   - KEY_FILE      — path to the downloaded .p8 private key file
 */

import { createSign } from 'crypto'
import { readFileSync } from 'fs'

// ── Fill these in ─────────────────────────────────────────────────────────────
const TEAM_ID   = 'XXXXXXXXXX'          // 10-char Team ID
const KEY_ID    = 'XXXXXXXXXX'          // 10-char Key ID
const CLIENT_ID = 'com.yourapp.signin'  // Services ID identifier
const KEY_FILE  = './AuthKey_XXXXXXXX.p8'
// ─────────────────────────────────────────────────────────────────────────────

const privateKey = readFileSync(KEY_FILE, 'utf8')

const now     = Math.floor(Date.now() / 1000)
const exp     = now + 15777000 // ~6 months (Apple's maximum)

const header  = Buffer.from(JSON.stringify({ alg: 'ES256', kid: KEY_ID })).toString('base64url')
const payload = Buffer.from(JSON.stringify({
  iss: TEAM_ID,
  iat: now,
  exp,
  aud: 'https://appleid.apple.com',
  sub: CLIENT_ID,
})).toString('base64url')

const data      = `${header}.${payload}`
const sign      = createSign('SHA256')
sign.update(data)
const signature = sign.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' }, 'base64url')

const jwt = `${data}.${signature}`

console.log('\n✅ Apple client_secret JWT (paste this into Supabase):\n')
console.log(jwt)
console.log('\n⚠️  This expires in ~6 months. Regenerate before it expires.\n')
console.log(`Expires: ${new Date(exp * 1000).toLocaleDateString()}\n`)
