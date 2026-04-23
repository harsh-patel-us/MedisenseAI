import asyncio
import os
import io
import wave
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
    
    # Create a simple valid wav file containing a sine wave (a long beep)
    wav_io = io.BytesIO()
    with wave.open(wav_io, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        # write 1 second of silence
        data = b'\x00\x00' * 16000
        w.writeframes(data)
    
    audio_bytes = wav_io.getvalue()
    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
    
    TRANSCRIPTION_PROMPT = "Transcribe the audio exactly. If silence, output <silence>."

    print("Testing google/gemini-2.5-flash with input_audio (wav)...")
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

    print("Testing google/gemini-1.5-pro with audio_url...")
    try:
        response = await client.chat.completions.create(
            model="google/gemini-1.5-pro",
            messages=[
                {"role": "system", "content": TRANSCRIPTION_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "audio_url",
                            "audio_url": {
                                "url": f"data:audio/wav;base64,{audio_b64}"
                            }
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
