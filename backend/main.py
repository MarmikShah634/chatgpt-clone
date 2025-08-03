from fastapi import FastAPI, HTTPException, Depends, Query, Request, Response
from pydantic import BaseModel
from typing import List, Optional
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, ForeignKey, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship, Session
from passlib.context import CryptContext
import json
import speech_recognition as sr
import pyttsx3
from langchain_community.chat_message_histories import ChatMessageHistory
from langchain.prompts import PromptTemplate
from langchain_ollama import OllamaLLM
import io

# Database setup
SQLALCHEMY_DATABASE_URL = "sqlite:///./chatgpt_clone.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Models
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    chats = relationship("Chat", back_populates="owner")

class Chat(Base):
    __tablename__ = "chats"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    first_question = Column(Text, nullable=True) # To store the first question for the title
    conversation_history = Column(Text, default="[]") # Stores JSON string of [{role: "user", content: "..."}]
    # We can keep 'question' and 'answer' if needed for legacy or simplified access,
    # but 'conversation_history' will be the primary source for full chat.
    # For now, let's remove them to avoid redundancy and rely solely on conversation_history
    # question = Column(Text) # Removed
    # answer = Column(Text)   # Removed
    owner = relationship("User", back_populates="chats")

Base.metadata.create_all(bind=engine)

# Pydantic schemas
class UserCreate(BaseModel):
    username: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class ChatMessagePayload(BaseModel): # Renamed to avoid confusion with internal Message object
    question: str

class Message(BaseModel): # Represents a single message in the conversation
    role: str
    content: str

class ChatResponse(BaseModel):
    id: int
    title: str # Changed from 'question' to 'title'
    conversation_history: str # Full conversation as JSON string

# AI model setup
llm = OllamaLLM(model="gemma2:2b")
prompt = PromptTemplate(
    input_variables=["chat_history", "question"],
    template="Previous conversation: {chat_history}\nUser: {question}\nAI:"
)

# FastAPI app
app = FastAPI()

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Utility functions
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def get_user(db: Session, username: str):
    return db.query(User).filter(User.username == username).first()

def authenticate_user(db: Session, username: str, password: str):
    user = get_user(db, username)
    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user

# Helper to create chat title from first question
def create_chat_title(question: str) -> str:
    words = question.split(' ')
    return ' '.join(words[:3]) + ('...' if len(words) > 3 else '')

# Speech-to-Text and Text-to-Speech setup (moved to top-level)
recognizer = sr.Recognizer()
engine = pyttsx3.init()
engine.setProperty("rate", 160)

# === Important: These endpoints are key for web integration ===

@app.post("/speech_to_text")
async def speech_to_text(request: Request):
    """
    Receives audio data from the frontend, converts it to text,
    and returns the transcribed text.
    Assumes audio is sent as raw bytes in the request body.
    Expects audio/wav or raw PCM.
    """
    try:
        audio_data = await request.body()

        try:
            # Try to interpret as WAV file first
            with io.BytesIO(audio_data) as audio_buffer:
                with sr.AudioFile(audio_buffer) as source:
                    audio = recognizer.record(source)
            text = recognizer.recognize_google(audio, language="en-IN") # Added language for Indian English, adjust as needed
            print(f"STT: Recognized (WAV): {text}")
            return {"text": text}
        except Exception as e_wav:
            print(f"STT: Could not process as WAV, trying raw AudioData. Error: {e_wav}")
            # Fallback for raw PCM bytes (requires knowing frontend's exact audio format)
            # IMPORTANT: Adjust sample_rate and sample_width based on your frontend's recording
            try:
                # Common: sample_rate=16000, sample_width=2 (for 16-bit PCM)
                audio = sr.AudioData(audio_data, sample_rate=16000, sample_width=2)
                text = recognizer.recognize_google(audio, language="en-IN") # Added language
                print(f"STT: Recognized (raw): {text}")
                return {"text": text}
            except Exception as inner_e:
                print(f"STT: Failed to recognize raw audio: {inner_e}")
                raise HTTPException(status_code=400, detail=f"Could not understand audio: {inner_e}")

    except sr.UnknownValueError:
        raise HTTPException(status_code=400, detail="Google Speech Recognition could not understand audio.")
    except sr.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Could not request results from Google Speech Recognition service; {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred during speech recognition: {e}")

# @app.post("/speech_to_text")
# async def speech_to_text(request: Request):
#     """
#     Receives WAV audio data from the frontend, converts it to text,
#     and returns the transcribed text.
#     """
#     try:
#         audio_data = await request.body() # This will be the WAV bytes

#         # Attempt to interpret as WAV file only
#         with io.BytesIO(audio_data) as audio_buffer:
#             with sr.AudioFile(audio_buffer) as source:
#                 audio = recognizer.record(source) # read the entire audio file

#         # Add language if specific to Indian English
#         # For general English, you can omit `language="en-IN"`
#         text = recognizer.recognize_google(audio, language="en-IN")
#         print(f"STT: Recognized: {text}")
#         return {"text": text}

#     except sr.UnknownValueError:
#         raise HTTPException(status_code=400, detail="Google Speech Recognition could not understand audio.")
#     except sr.RequestError as e:
#         raise HTTPException(status_code=503, detail=f"Could not request results from Google Speech Recognition service; {e}")
#     except Exception as e:
#         # Catch any other error during WAV processing or recognition
#         print(f"STT unexpected error: {e}")
#         raise HTTPException(status_code=500, detail=f"An unexpected error occurred during speech recognition: {e}")

# Routes
@app.post("/signup")
def signup(user: UserCreate, db: Session = Depends(get_db)):
    db_user = get_user(db, user.username)
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    hashed_password = get_password_hash(user.password)
    new_user = User(username=user.username, hashed_password=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"message": "User created successfully"}

@app.post("/login")
def login(user: UserLogin, db: Session = Depends(get_db)):
    auth_user = authenticate_user(db, user.username, user.password)
    if not auth_user:
        raise HTTPException(status_code=400, detail="Invalid username or password")
    return {"message": "Login successful", "username": auth_user.username}

@app.post("/chat", response_model=ChatResponse)
def chat(
    message_payload: ChatMessagePayload,
    username: str,
    chat_id: Optional[int] = Query(None), # Optional chat_id
    db: Session = Depends(get_db)
):
    user = get_user(db, username)
    if not user:
        raise HTTPException(status_code=400, detail="User not found")

    db_chat: Optional[Chat] = None
    conversation: List[Message] = []

    if chat_id:
        # Attempt to find existing chat
        db_chat = db.query(Chat).filter(Chat.id == chat_id, Chat.user_id == user.id).first()
        if not db_chat:
            raise HTTPException(status_code=404, detail="Chat not found for this user")
        conversation = json.loads(db_chat.conversation_history)

    # Add user's new message to conversation
    conversation.append({"role": "user", "content": message_payload.question})

    # Prepare chat history for LLM
    llm_chat_history = ChatMessageHistory()
    for msg in conversation:
        if msg["role"] == "user":
            llm_chat_history.add_user_message(msg["content"])
        elif msg["role"] == "assistant":
            llm_chat_history.add_ai_message(msg["content"])

    # Generate AI response
    chat_history_text = "\n".join([f"{msg.type.capitalize()}: {msg.content}" for msg in llm_chat_history.messages])
    print(f"Chat History Sent to LLM: \n{chat_history_text}")
    llm_response = llm.invoke(prompt.format(chat_history=chat_history_text, question=message_payload.question))
    print(f"LLM Raw Response: '{llm_response}'") 

    # Add AI's response to conversation
    conversation.append({"role": "assistant", "content": llm_response})

    if db_chat:
        # Update existing chat
        db_chat.conversation_history = json.dumps(conversation)
        if not db_chat.first_question: # If first question wasn't set (e.g., initial empty chat)
            db_chat.first_question = message_payload.question
        db.add(db_chat)
        db.commit()
        db.refresh(db_chat)
    else:
        # Create new chat
        new_chat = Chat(
            user_id=user.id,
            first_question=message_payload.question,
            conversation_history=json.dumps(conversation)
        )
        db.add(new_chat)
        db.commit()
        db.refresh(new_chat)
        db_chat = new_chat

    return ChatResponse(
        id=db_chat.id,
        title=create_chat_title(db_chat.first_question or "New Chat"), # Ensure a title
        conversation_history=db_chat.conversation_history
    )

@app.get("/chats", response_model=List[ChatResponse])
def get_chats(username: str, db: Session = Depends(get_db)):
    user = get_user(db, username)
    if not user:
        raise HTTPException(status_code=400, detail="User not found")
    chats = db.query(Chat).filter(Chat.user_id == user.id).all()
    return [
        ChatResponse(
            id=chat.id,
            title=create_chat_title(chat.first_question or "Untitled Chat"),
            conversation_history=chat.conversation_history # Return full history for get_chats as well (optional, but good for consistency)
        )
        for chat in chats
    ]

@app.get("/chat/{chat_id}", response_model=ChatResponse)
def get_chat(chat_id: int, db: Session = Depends(get_db)):
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    return ChatResponse(
        id=chat.id,
        title=create_chat_title(chat.first_question or "Untitled Chat"),
        conversation_history=chat.conversation_history
    )

@app.delete("/chat/{chat_id}")
def delete_chat(chat_id: int, db: Session = Depends(get_db)):
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    db.delete(chat)
    db.commit()
    return {"message": "Chat deleted successfully"}

@app.delete("/chats")
def delete_all_chats(username: str, db: Session = Depends(get_db)):
    user = get_user(db, username)
    if not user:
        raise HTTPException(status_code=400, detail="User not found")
    deleted = db.query(Chat).filter(Chat.user_id == user.id).delete()
    db.commit()
    return {"message": f"Deleted {deleted} chats successfully"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)