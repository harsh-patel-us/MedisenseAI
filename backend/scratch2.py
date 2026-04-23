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
    
    # fake audio buffer
    audio_bytes = b"RIFF" + b"\x00" * 100
    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
    
    # Try gemini-2.5-flash with audio_url
    try:
        response = await client.chat.completions.create(
            model="google/gemini-2.5-flash",
            messages=[
                {"role": "system", "content": "You are a transcription service. Transcribe the audio."},
                {
                    "role": "user", 
                    "content": [
                        {
                            "type": "text", 
                            "text": "Please transcribe this audio"
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:audio/wav;base64,{audio_b64}"
                            }
                        }
                    ]
                }
            ],
            temperature=0.0
        )
        print("Response 2.5 with image_url:", response.choices[0].message.content)
    except Exception as e:
        print("Error 2.5 image_url:", e)

asyncio.run(main())
