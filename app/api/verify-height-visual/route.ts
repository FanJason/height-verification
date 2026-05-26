import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(req: NextRequest) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  try {
    const { imageBase64, shoeHeightInches } = await req.json()
    if (!imageBase64) return NextResponse.json({ error: 'No image' }, { status: 400 })

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `A person is holding a standard government ID card (credit card size: exactly 85.6mm wide × 54mm tall) flat against their chest, facing the camera. Use the card as a physical ruler to estimate their bare height.

Respond with ONLY valid JSON — no markdown, no explanation.

{
  "fullBodyVisible": boolean,
  "cardVisible": boolean,
  "estimatedHeightInches": number or null,
  "wearingShoes": boolean,
  "estimatedShoeHeightInches": number,
  "bareHeightInches": number or null,
  "confidence": "high" | "medium" | "low",
  "feedback": string
}

fullBodyVisible: true only if the full body is visible from crown of head to feet on the floor
cardVisible: true if an ID/credit card is clearly visible being held at chest level

estimatedHeightInches: the person's total height including any footwear:
  1. Measure the card height in pixels (54mm real)
  2. pixels_per_mm = card_height_px / 54
  3. Measure crown-of-head to floor-of-heels in pixels
  4. height_mm = pixels / pixels_per_mm
  5. Round to nearest whole inch
  Only if both fullBodyVisible and cardVisible are true.

wearingShoes: true if they appear to be wearing any footwear (not barefoot)
estimatedShoeHeightInches: estimated heel height (0 if barefoot, 0.5 for flat shoes, 1 for sneakers, 1.25 for dress shoes, 1.5+ for boots/heels)
bareHeightInches: estimatedHeightInches minus estimatedShoeHeightInches, rounded to nearest whole inch

confidence: high/medium/low based on card clarity and body visibility
feedback: one short specific instruction if something is wrong`,
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

    const result = JSON.parse(jsonMatch[0])

    // bareHeightInches is already computed by the model; fall back if missing
    if (!result.bareHeightInches && result.estimatedHeightInches) {
      result.bareHeightInches = Math.round(
        result.estimatedHeightInches - (result.estimatedShoeHeightInches || 0)
      )
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('verify-height-visual error:', err)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
