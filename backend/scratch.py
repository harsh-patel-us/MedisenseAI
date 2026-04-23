import asyncio
import os
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
    
    # Try gemini-3-flash-preview
    try:
        print("Testing google/gemini-3-flash-preview")
        response = await client.chat.completions.create(
            model="google/gemini-3-flash-preview",
            messages=[
                {"role": "system", "content": "You are a transcription service. Transcribe the audio."},
                {"role": "user", "content": [{"type": "text", "text": "Please transcribe this audio"}]}
            ]
        )
        print("Response 3:", response.choices[0].message.content)
    except Exception as e:
        print("Error 3:", e)

    # Try gemini-1.5-flash
    try:
        print("Testing google/gemini-1.5-flash")
        response = await client.chat.completions.create(
            model="google/gemini-1.5-flash",
            messages=[
                {"role": "system", "content": "You are a transcription service. Transcribe the audio verbatim."},
                {"role": "user", "content": [{"type": "text", "text": "Please transcribe this audio"}]}
            ]
        )
        print("Response 1.5:", response.choices[0].message.content)
    except Exception as e:
        print("Error 1.5:", e)

    # Try gemini-2.0-flash-exp
    try:
        print("Testing google/gemini-2.5-flash")
        response = await client.chat.completions.create(
            model="google/gemini-2.5-flash",
            messages=[
                {"role": "system", "content": "You are a transcription service. Transcribe the audio verbatim."},
                {"role": "user", "content": [{"type": "text", "text": "Please transcribe this audio"}]}
            ]
        )
        print("Response 2.5:", response.choices[0].message.content)
    except Exception as e:
        print("Error 2.5:", e)


asyncio.run(main())
