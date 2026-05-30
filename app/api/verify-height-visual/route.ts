import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(req: NextRequest) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  try {
    const { imageBase64 } = await req.json()
    if (!imageBase64) return NextResponse.json({ error: 'No image' }, { status: 400 })

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Look at this photo. Respond with ONLY valid JSON — no markdown, no explanation.

{
  "singlePerson": boolean,
  "fullBodyVisible": boolean,
  "feedback": string
}

singlePerson: true if exactly one person is visible in the frame
fullBodyVisible: true if that person's entire body is visible — from the top of their head down to their feet
feedback: one short instruction for the first failed condition, or empty string if both pass`,
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
