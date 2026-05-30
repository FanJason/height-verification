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
              text: `Analyze this full-body photo and estimate the person's height.

Respond with ONLY valid JSON — no markdown, no explanation.

{
  "fullBodyVisible": boolean,
  "singlePerson": boolean,
  "cameraParallel": boolean,
  "estimatedHeightInches": number or null,
  "confidence": "high" | "medium" | "low",
  "feedback": string
}

fullBodyVisible: true only if the complete body is visible from crown of head to feet on the floor
singlePerson: true if exactly one person is in the frame
cameraParallel: true if the person is facing the camera straight on, not turned at an angle that would foreshorten their height

estimatedHeightInches: estimate the person's height in inches using body proportion analysis:
  - Use the ratio of head size to total body height (average head is ~1/7.5 of total height)
  - Cross-check with leg length (~47% of height) and torso length
  - Consider the person's build and typical human proportions
  - Round to the nearest whole inch
  Only compute if fullBodyVisible, singlePerson, and cameraParallel are all true.

confidence: high if proportions are clear and consistent, medium if estimate is rough, low if image quality is poor
feedback: one short instruction for the first failed condition, or empty string if all pass`,
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
