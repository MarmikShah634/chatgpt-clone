import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {Sidebar} from './components/Sidebar';
import LoginForm from './components/LoginForm';
import SignupForm from './components/SignupForm';
import ChatSection from './components/ChatSection';
import type { RootState, AppDispatch } from './store';
import { login, logout, switchToLogin, switchToSignup, toggleSidebar, addNewChat, setMessages, setLoading, updateChatHistory, clearChat, setChatHistory, setCurrentChatId } from './store';

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
      // Fetch chat history from backend
      fetch(`http://localhost:8000/chats?username=${encodeURIComponent(user)}`)
        .then((res) => res.json())
        .then((data) => {
          // Map chat titles to first 2-3 words of question
          const chats = data.map((chat: any) => ({
            id: chat.id,
            title: chat.question.split(' ').slice(0, 3).join(' ') + (chat.question.split(' ').length > 3 ? '...' : ''),
          }));
          dispatch(setChatHistory(chats));
        })
        .catch(() => {
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
          const newMessages = [
            { role: 'user' as const, content: data.question },
            { role: 'assistant' as const, content: data.answer },
          ];
          dispatch(setMessages(newMessages));
          dispatch(setCurrentChatId(id));
        })
      .catch(() => {
        // Handle error if needed
      })
      .finally(() => {
        dispatch(setLoading(false));
      });
  };

  const addNewChatHandler = () => {
    dispatch(setMessages([]));
    dispatch(setCurrentChatId(null));
    // Optionally refetch chat history to include new chat if saved
    if (user) {
      fetch(`http://localhost:8000/chats?username=${encodeURIComponent(user)}`)
        .then((res) => res.json())
        .then((data) => {
          const chats = data.map((chat: any) => ({
            id: chat.id,
            title: chat.question.split(' ').slice(0, 3).join(' ') + (chat.question.split(' ').length > 3 ? '...' : ''),
          }));
          dispatch(setChatHistory(chats));
        })
        .catch(() => {
          dispatch(setChatHistory([]));
        });
    }
  };

  const onSendMessage = async (message: string) => {
    if (!user) return;
    // Immediately add user message
    const userMessage = { role: 'user' as const, content: message };
    const newMessages = [...messages, userMessage];
    dispatch(setMessages(newMessages));
    dispatch(setLoading(true));
    try {
      const response = await fetch(`http://localhost:8000/chat?username=${encodeURIComponent(user)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: message }),
      });
      if (!response.ok) {
        dispatch(setLoading(false));
        return;
      }
      const data = await response.json();
      const assistantMessage = { role: 'assistant' as const, content: data.answer };
      dispatch(setMessages([...newMessages, assistantMessage]));

      if (currentChatId !== null) {
        dispatch(updateChatHistory({ id: currentChatId, messages: [...newMessages, assistantMessage] }));
      }
    } catch (error: any) {
      console.log(error.message)
    }
    dispatch(setLoading(false));
  };

  const handleLogin = (username: string) => {
    dispatch(login(username));
    dispatch(addNewChat());
  };

  const handleSignup = (username: string) => {
    dispatch(login(username));
    dispatch(addNewChat());
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
