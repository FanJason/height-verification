import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(req: NextRequest) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  try {
    const { imageBase64 } = await req.json()
    if (!imageBase64) return NextResponse.json({ error: 'No image' }, { status: 400 })

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 150,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Look at this image and respond with ONLY valid JSON, no markdown.

Determine if a government ID (driver's license, state ID, passport) is visible.

Return:
{
  "detected": boolean,
  "fullyVisible": boolean,
  "legible": boolean,
  "feedback": string
}

detected: true if an ID card or document is visible anywhere in the image
fullyVisible: true if the majority of the ID is visible (at least 3 corners visible, card not heavily cropped). Be lenient — slight edge trimming is fine.
legible: true if the text appears generally readable. Minor glare or slight blur is acceptable as long as a height field could plausibly be read. Only return false if the image is very blurry or the card is completely obscured by glare.
feedback: one short friendly instruction (e.g. "Move the ID a bit closer", "Try to steady the camera", "Reduce glare by tilting slightly", "Looking good, hold still")

Be generous: if you can see most of a government ID and the text is mostly readable, return fullyVisible: true and legible: true.`,
            },
            {
              type: 'image_url',
              image_url: { url: imageBase64, detail: 'low' },
            },
          ],
        },
      ],
    })

    const content = response.choices[0].message.content ?? ''
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ detected: false, fullyVisible: false, legible: false, feedback: 'Try again' })

    return NextResponse.json(JSON.parse(jsonMatch[0]))
  } catch (err) {
    console.error('detect-id error:', err)
    return NextResponse.json({ detected: false, fullyVisible: false, legible: false, feedback: 'Try again' })
  }
}
