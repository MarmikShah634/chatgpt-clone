import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Sidebar } from './components/Sidebar';
import LoginForm from './components/LoginForm';
import SignupForm from './components/SignupForm';
import ChatSection from './components/ChatSection';
import type { RootState, AppDispatch } from './store';
import { login, logout, switchToLogin, switchToSignup, toggleSidebar, setMessages, setLoading, clearChat, setChatHistory, setCurrentChatId } from './store';

interface Message {
  role: "user" | "assistant";
  content: string;
}

const Header: React.FC<{ onLogout: () => void }> = ({ onLogout }) => (
  <header className="flex justify-between items-center p-4 bg-gray-900 text-white">
    <h2 className="text-xl font-bold">ChatGPT Clone</h2>
    <button
      onClick={onLogout}
      className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
    >
      Logout
    </button>
  </header>
);

function App() {
  const dispatch = useDispatch<AppDispatch>();
  const user = useSelector((state: RootState) => state.auth.user);
  const authView = useSelector((state: RootState) => state.auth.authView);
  const isSidebarOpen = useSelector((state: RootState) => state.chat.isSidebarOpen);
  const chatHistory = useSelector((state: RootState) => state.chat.chatHistory);
  const currentChatId = useSelector((state: RootState) => state.chat.currentChatId);
  const messages = useSelector((state: RootState) => state.chat.messages);
  const loading = useSelector((state: RootState) => state.chat.loading);

  useEffect(() => {
    if (user) {
      fetch(`http://localhost:8000/chats?username=${encodeURIComponent(user)}`)
        .then((res) => res.json())
        .then((data) => {
          const chats = data.map((chat: any) => {
            const title = chat.title || "Untitled Chat"; 
            return {
              id: chat.id,
              title: title,
            };
          });
          dispatch(setChatHistory(chats));
        })
        .catch((error) => {
          console.error("Error fetching chat history:", error);
          dispatch(setChatHistory([]));
        });
    }
  }, [user, dispatch]);

  const toggleSidebarHandler = () => {
    dispatch(toggleSidebar());
  };

  const selectChatHandler = (id: number) => {
    if (!user) return;
    dispatch(setLoading(true));
    fetch(`http://localhost:8000/chat/${id}`)
      .then((res) => res.json())
      .then((data) => {
        const conversation = JSON.parse(data.conversation_history || "[]");
        const newMessages = conversation.map((msg: any) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        }));
        dispatch(setMessages(newMessages));
        dispatch(setCurrentChatId(id));
      })
      .catch((error) => {
        console.error("Error fetching chat details:", error);
        dispatch(setMessages([]));
      })
      .finally(() => {
        dispatch(setLoading(false));
      });
  };

  const addNewChatHandler = async () => {
    dispatch(setCurrentChatId(null));
    dispatch(setMessages([]));
    dispatch(toggleSidebar());
  };

  const onSendMessage = async (message: string) => {
  if (!user) return;

  
  const userMessage = { role: 'user' as const, content: message };
  
  dispatch(setMessages([...messages, userMessage]));
  dispatch(setLoading(true));

  try {
    const url = `http://localhost:8000/chat?username=${encodeURIComponent(user)}${currentChatId ? `&chat_id=${currentChatId}` : ''}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: message }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Failed to send message:", response.status, errorText);
      dispatch(setLoading(false));
      return;
    }

    const data = await response.json();

    const conversationFromBackend: Message[] = JSON.parse(data.conversation_history);

    dispatch(setMessages(conversationFromBackend));

    if (!currentChatId) {
      dispatch(setCurrentChatId(data.id));
    }

    const chatsResponse = await fetch(`http://localhost:8000/chats?username=${encodeURIComponent(user)}`);
    if (chatsResponse.ok) {
      const chatsData = await chatsResponse.json();
      const chats = chatsData.map((chat: any) => {
        const title = chat.title || "Untitled Chat";
        return {
          id: chat.id,
          title: title,
        };
      });
      dispatch(setChatHistory(chats));
    }

  } catch (error: any) {
    console.error("Error sending message or parsing response:", error.message);
  } finally {
    dispatch(setLoading(false));
  }
};

  const handleLogin = (username: string) => {
    dispatch(login(username));
    dispatch(setCurrentChatId(null));
    dispatch(setMessages([]));
  };

  const handleSignup = (username: string) => {
    dispatch(login(username));
    dispatch(setCurrentChatId(null));
    dispatch(setMessages([]));
  };

  const handleLogout = () => {
    dispatch(logout());
    dispatch(clearChat());
  };

  const switchToSignupHandler = () => {
    dispatch(switchToSignup());
  };

  const switchToLoginHandler = () => {
    dispatch(switchToLogin());
  };

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {user && (
        <Sidebar
          isOpen={isSidebarOpen}
          toggleSidebar={toggleSidebarHandler}
          chatHistory={chatHistory}
          selectChat={selectChatHandler}
          createNewChat={addNewChatHandler}
        />
      )}
      <main className="flex flex-col flex-grow">
        {!user && authView === 'login' && (
          <LoginForm onLogin={handleLogin} switchToSignup={switchToSignupHandler} />
        )}
        {!user && authView === 'signup' && (
          <SignupForm onSignup={handleSignup} switchToLogin={switchToLoginHandler} />
        )}
        {user && (
          <>
            <Header onLogout={handleLogout} />
            <ChatSection
              messages={messages}
              onSendMessage={onSendMessage}
              loading={loading}
            />
          </>
        )}
      </main>
    </div>
  );
}

export default App;