import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { parseHeightToInches } from '@/lib/height-utils'

export async function POST(req: NextRequest) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  try {
    const { imageBase64 } = await req.json()
    if (!imageBase64) return NextResponse.json({ error: 'No image provided' }, { status: 400 })

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this image and respond with ONLY a JSON object — no markdown, no explanation.

Check if this is a government-issued photo ID (driver's license, state ID, passport). If it is, find the height field.

Return exactly:
{
  "isValidId": boolean,
  "heightVisible": boolean,
  "heightText": string or null,
  "heightInches": number or null
}

heightText should be the raw text from the ID (e.g. "5'11\\"" or "511" or "5-11").
heightInches should be the total inches (e.g. 71 for 5'11").
If the ID is not a valid government photo ID, set isValidId to false and all other fields to null/false.
If height is not legible, set heightVisible to false.`,
            },
            {
              type: 'image_url',
              image_url: { url: imageBase64, detail: 'high' },
            },
          ],
        },
      ],
    })

    const content = response.choices[0].message.content ?? ''
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ error: 'Could not parse AI response' }, { status: 500 })

    const parsed = JSON.parse(jsonMatch[0])

    // Validate and normalize heightInches
    if (parsed.heightText && !parsed.heightInches) {
      parsed.heightInches = parseHeightToInches(parsed.heightText)
    }

    // Sanity check height is in realistic range (4'0" to 7'6")
    if (parsed.heightInches && (parsed.heightInches < 48 || parsed.heightInches > 90)) {
      parsed.heightInches = null
      parsed.heightVisible = false
    }

    return NextResponse.json(parsed)
  } catch (err) {
    console.error('verify-id error:', err)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
