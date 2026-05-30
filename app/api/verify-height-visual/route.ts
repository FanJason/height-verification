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
              text: `Analyze this full-body photo. Respond with ONLY valid JSON — no markdown, no explanation.

{
  "singlePerson": boolean,
  "fullBodyVisible": boolean,
  "cameraParallel": boolean,
  "estimatedHeightInches": number | null,
  "feedback": string
}

singlePerson: true if exactly one person is in the frame
fullBodyVisible: true if the complete body is visible from crown of head to feet
cameraParallel: true if the person is facing the camera straight on (not turned at an angle that would foreshorten height)
estimatedHeightInches: estimate height in inches using body proportion analysis:
  - Head-to-body ratio (average head ≈ 1/7.5 of total height)
  - Cross-check with leg length (~47% of height) and torso
  - Round to nearest whole inch
  - Only set if singlePerson, fullBodyVisible, and cameraParallel are all true; otherwise null
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
