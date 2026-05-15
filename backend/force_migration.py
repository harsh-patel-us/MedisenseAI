import asyncio
import dotenv
dotenv.load_dotenv()

from database import engine
from sqlalchemy import text

async def main():
    async with engine.begin() as conn:
        try:
            await conn.execute(text("ALTER TABLE patient_chat_messages ADD COLUMN is_deleted BOOLEAN DEFAULT false"))
            print("Added is_deleted to patient_chat_messages")
        except Exception as e:
            print("Error or already exists (patient_chat_messages):", e)
            
        try:
            await conn.execute(text("ALTER TABLE chatbot_messages ADD COLUMN is_deleted BOOLEAN DEFAULT false"))
            print("Added is_deleted to chatbot_messages")
        except Exception as e:
            print("Error or already exists (chatbot_messages):", e)

if __name__ == "__main__":
    asyncio.run(main())