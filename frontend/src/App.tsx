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

  // Effect to fetch chat history when user logs in
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
          // --- START OF CHANGE ---
          // REMOVED: Logic to select the first chat if chatHistory exists.
          // By removing this, currentChatId will remain null after login,
          // effectively opening a "new chat" view by default.
          /*
          if (chats.length > 0 && currentChatId === null) {
            dispatch(setCurrentChatId(chats[0].id));
            // Also fetch messages for the first chat
            fetch(`http://localhost:8000/chat/${chats[0].id}`)
              .then(res => res.json())
              .then(chatData => {
                const conversation = JSON.parse(chatData.conversation_history || "[]");
                const newMessages = conversation.map((msg: any) => ({
                  role: msg.role as 'user' | 'assistant',
                  content: msg.content,
                }));
                dispatch(setMessages(newMessages));
              })
              .catch(error => console.error("Error fetching initial chat messages:", error));
          }
          */
          // --- END OF CHANGE ---
        })
        .catch((error) => {
          console.error("Error fetching chat history:", error);
          dispatch(setChatHistory([]));
        });
    }
  }, [user, dispatch]); // currentChatId removed from dependency array as we no longer conditionally check it here for initial selection

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
    // This will cause ChatSection to unmount and remount due to key change (currentChatId becomes null)
    dispatch(setCurrentChatId(null));
    dispatch(setMessages([])); // Clear messages for a truly new chat view
    dispatch(toggleSidebar()); // Close sidebar after creating new chat
  };

  const onSendMessage = async (message: string) => {
    if (!user) return;

    // Immediately add user message to Redux state for instant display
    const userMessage = { role: 'user' as const, content: message };
    dispatch(setMessages([...messages, userMessage]));
    dispatch(setLoading(true));

    try {
      // If currentChatId is null, it means we're starting a new chat
      // The backend will create a new chat and return its ID
      const url = `http://localhost:8000/chat?username=${encodeURIComponent(user)}${currentChatId ? `&chat_id=${currentChatId}` : ''}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: message }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Failed to send message:", response.status, errorText);
        // Revert messages if send fails
        dispatch(setMessages(messages)); 
        dispatch(setLoading(false));
        return;
      }

      const data = await response.json();
      console.log("Received data from backend:", data);

      // Parse the complete conversation history from the backend response
      const conversationFromBackend: Message[] = JSON.parse(data.conversation_history);
      dispatch(setMessages(conversationFromBackend)); // Update Redux state with full conversation

      // If it was a new chat, set the currentChatId to the ID returned by the backend
      if (currentChatId === null) {
        dispatch(setCurrentChatId(data.id));
      }

      // Re-fetch chat history to update sidebar titles (especially for new chats)
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
      // Revert messages if error
      dispatch(setMessages(messages)); 
    } finally {
      dispatch(setLoading(false));
    }
  };

  const handleLogin = (username: string) => {
    dispatch(login(username));
    // When logging in, ensure current chat and messages are cleared to start a new default chat
    dispatch(setCurrentChatId(null));
    dispatch(setMessages([]));
  };

  const handleSignup = (username: string) => {
    dispatch(login(username));
    // When signing up, ensure current chat and messages are cleared to start a new default chat
    dispatch(setCurrentChatId(null));
    dispatch(setMessages([]));
  };

  const handleLogout = () => {
    dispatch(logout());
    dispatch(clearChat()); // Clears messages and currentChatId from Redux
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
            {/*
              FIX: Removed the conditional rendering `{currentChatId !== null ? (...) : (...)}`
              Now, ChatSection is always rendered when a user is logged in.
              Its 'key' prop will still ensure it re-mounts and clears state
              when currentChatId changes (including when it becomes null for a new chat).
            */}
            <ChatSection
              // When currentChatId is null (for a new chat), use a distinct key like "new-chat"
              // This ensures ChatSection still re-mounts and clears its state.
              key={currentChatId === null ? "new-chat" : currentChatId}
              messages={messages} // Will be empty if currentChatId is null
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