import asyncio
import os
import base64
from openai import AsyncOpenAI

async def main():
    api_key = ""
    with open("c:/projects/MedisenseAI/backend/.env", "r") as f:
        for line in f:
            if line.startswith("OPENROUTER_API_KEY="):
                api_key = line.strip().split("=")[1].strip('"')
    
    client = AsyncOpenAI(
        api_key=api_key,
        base_url="https://openrouter.ai/api/v1",
    )
    
    # fake silent audio buffer
    audio_bytes = b"RIFF" + b"\x00" * 80000
    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
    
    TRANSCRIPTION_PROMPT = (
        "You are an expert medical transcription service. "
        "Transcribe the following audio recording verbatim. "
        "Include every word spoken, preserving the natural speech patterns. "
        "If multiple speakers are present, start each speaker turn on a new line. "
        "Return ONLY the transcription text — no commentary, no labels, no timestamps, "
        "no markdown formatting. "
        "CRITICAL: If the audio contains only silence, background noise, or unintelligible sounds, you MUST return an EXACTLY empty string. Do not hallucinate a transcript."
    )

    models_to_test = ["google/gemini-3-flash-preview", "google/gemini-2.5-flash"]
    for model in models_to_test:
        print(f"Testing {model}...")
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": TRANSCRIPTION_PROMPT},
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "input_audio",
                                "input_audio": {
                                    "data": audio_b64,
                                    "format": "wav",
                                },
                            },
                        ],
                    },
                ],
                temperature=0.0,
            )
            print(f"Response ({model}):\n>|{response.choices[0].message.content}|<")
            print("-" * 40)
        except Exception as e:
            print(f"Error ({model}):", e)
            print("-" * 40)

asyncio.run(main())
