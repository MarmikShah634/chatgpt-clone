from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, ForeignKey, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship, Session
from passlib.context import CryptContext

from langchain_community.chat_message_histories import ChatMessageHistory
from langchain.prompts import PromptTemplate
from langchain_ollama import OllamaLLM

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
    question = Column(Text)
    answer = Column(Text)
    owner = relationship("User", back_populates="chats")

Base.metadata.create_all(bind=engine)

# Pydantic schemas
class UserCreate(BaseModel):
    username: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class ChatMessage(BaseModel):
    question: str
    answer: Optional[str] = None

class ChatResponse(BaseModel):
    id: int
    question: str
    answer: str

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
def chat(message: ChatMessage, username: str, db: Session = Depends(get_db)):
    user = get_user(db, username)
    if not user:
        raise HTTPException(status_code=400, detail="User not found")

    # Retrieve chat history for user
    chat_history = ChatMessageHistory()
    user_chats = db.query(Chat).filter(Chat.user_id == user.id).all()
    for chat_msg in user_chats:
        chat_history.add_user_message(chat_msg.question)
        chat_history.add_ai_message(chat_msg.answer)

    # Generate AI response
    chat_history_text = "\n".join([f"{msg.type.capitalize()}: {msg.content}" for msg in chat_history.messages])
    response = llm.invoke(prompt.format(chat_history=chat_history_text, question=message.question))

    # Store new chat in DB
    new_chat = Chat(user_id=user.id, question=message.question, answer=response)
    db.add(new_chat)
    db.commit()
    db.refresh(new_chat)

    return ChatResponse(id=new_chat.id, question=new_chat.question, answer=new_chat.answer)

@app.get("/chats", response_model=List[ChatResponse])
def get_chats(username: str, db: Session = Depends(get_db)):
    user = get_user(db, username)
    if not user:
        raise HTTPException(status_code=400, detail="User not found")
    chats = db.query(Chat).filter(Chat.user_id == user.id).all()
    return [ChatResponse(id=chat.id, question=chat.question, answer=chat.answer) for chat in chats]

@app.get("/chat/{chat_id}", response_model=ChatResponse)
def get_chat(chat_id: int, db: Session = Depends(get_db)):
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    return ChatResponse(id=chat.id, question=chat.question, answer=chat.answer)

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