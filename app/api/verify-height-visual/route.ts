import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(req: NextRequest) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  try {
    const { imageBase64 } = await req.json()
    if (!imageBase64) return NextResponse.json({ error: 'No image' }, { status: 400 })

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `A person is holding a standard government ID card (credit card size: exactly 85.6mm wide × 54mm tall) flat against their chest, facing the camera. Use the card as a physical ruler to estimate their height.

Respond with ONLY valid JSON — no markdown, no explanation.

{
  "fullBodyVisible": boolean,
  "cardVisible": boolean,
  "singlePerson": boolean,
  "cameraParallel": boolean,
  "estimatedHeightInches": number or null,
  "confidence": "high" | "medium" | "low",
  "feedback": string
}

fullBodyVisible: true only if the full body is visible from crown of head to feet on the floor
cardVisible: true if an ID/credit card is clearly visible being held at chest level
singlePerson: true if exactly one person is visible in the frame
cameraParallel: true if the camera is roughly perpendicular to the person — they are facing straight toward the lens, not turned at an angle that would foreshorten their apparent height

estimatedHeightInches: the person's height from crown of head to floor:
  1. Measure the card height in pixels (54mm real)
  2. pixels_per_mm = card_height_px / 54
  3. Measure crown-of-head to floor-of-heels in pixels
  4. height_mm = pixels / pixels_per_mm
  5. Round to nearest whole inch
  Only set this if fullBodyVisible, cardVisible, singlePerson, and cameraParallel are all true.

confidence: high/medium/low based on card clarity and body visibility
feedback: one short specific instruction for whichever condition failed first, or empty string if all conditions pass`,
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
    if (!jsonMatch) return NextResponse.json({ error: 'Parse failed' }, { status: 500 })

    return NextResponse.json(JSON.parse(jsonMatch[0]))
  } catch (err) {
    console.error('verify-height-visual error:', err)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
