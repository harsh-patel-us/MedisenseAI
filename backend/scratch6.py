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
    
    # Let's create an empty webm file (or try to send missing headers)
    # Actually, we can just send "empty" audio and tell the prompt to return empty.
    
    # We will just write a very strict prompt and use "google/gemini-2.5-flash"
    audio_b64 = base64.b64encode(b"invalid_audio_bytes_123456").decode("utf-8")
    
    TRANSCRIPTION_PROMPT = (
        "You are an expert medical transcription service. "
        "Transcribe the following audio recording verbatim. "
        "Include every word spoken. "
        "CRITICAL INSTRUCTIONS: "
        "- If the audio is silent, unintelligible, or invalid, you MUST output EXACTLY the word '<silence>'. "
        "- DO NOT hallucinate, invent, or create a mock transcript under any circumstances."
    )

    print("Testing gemini-2.5-flash...")
    try:
        response = await client.chat.completions.create(
            model="google/gemini-2.5-flash",
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
                        {
                            "type": "text",
                            "text": "Transcribe this audio recording.",
                        },
                    ],
                },
            ],
            temperature=0.0,
        )
        print("Response:\n>|", response.choices[0].message.content, "|<")
    except Exception as e:
        print("Error:", e)

asyncio.run(main())
