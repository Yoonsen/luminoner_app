import { NextResponse } from 'next/server';

export const maxDuration = 60; // Tillat opptil 60 sekunder på Vercel Hobby-planen (for trege LLM-svar)
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { provider, model, apiKey, systemPrompt, prompt, temperature } = body;

    if (!apiKey) {
      return NextResponse.json({ error: 'Mangler API-nøkkel' }, { status: 400 });
    }

    let llmModel;

    if (provider === 'OpenAI') {
      const openai = createOpenAI({ apiKey });
      llmModel = openai(model);
    } else if (provider === 'Anthropic') {
      const anthropic = createAnthropic({ apiKey });
      llmModel = anthropic(model);
    } else if (provider === 'Google') {
      const google = createGoogleGenerativeAI({ apiKey });
      llmModel = google(model);
    } else {
      return NextResponse.json({ error: 'Ugyldig tilbyder' }, { status: 400 });
    }

    const tempVal = temperature !== undefined ? parseFloat(temperature) : 0.1;

    // Kall modellen ved bruk av Vercel AI SDK
    const { text } = await generateText({
      model: llmModel,
      system: systemPrompt,
      prompt: prompt,
      temperature: tempVal,
    });

    return NextResponse.json({ result: text });
  } catch (error: any) {
    console.error('API Route Error:', error);
    return NextResponse.json(
      { error: error.message || 'En feil oppstod under prosessering av forespørselen' }, 
      { status: 500 }
    );
  }
}
