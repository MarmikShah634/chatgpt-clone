import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../store';
import { deleteChat } from '../store';

interface SidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
  chatHistory: { id: number; title: string }[];
  selectChat: (id: number) => void;
  createNewChat: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, toggleSidebar, chatHistory, selectChat, createNewChat }) => {
  const dispatch = useDispatch<AppDispatch>();
  const [spinning, setSpinning] = useState(false);

  const handleToggle = () => {
    setSpinning(true);
    toggleSidebar();
    setTimeout(() => setSpinning(false), 500);
  };

  const handleDeleteChat = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if(confirm("Are you sure you want to delete this chat??")){
      dispatch(deleteChat(id));
      // You might want to clear current chat if deleted chat was active
      // dispatch(setCurrentChatId(null));
      // dispatch(setMessages([]));
    }
  };

  return (
    <div className={`bg-gray-800 text-white h-screen p-4 flex flex-col transition-width duration-300 ${isOpen ? 'w-64' : 'w-16'}`}>
      <button
        className={`mb-4 bg-gray-700 hover:bg-gray-600 rounded ${isOpen ? 'px-3 py-2' : 'p-1.5'} focus:outline-none flex items-center justify-center`}
        onClick={handleToggle}
        aria-label="Toggle Sidebar"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"></path>
        </svg>
      </button>
      {isOpen && (
        <>
          <div className="flex justify-between items-center mb-4">
            <button
              className="bg-blue-600 hover:bg-blue-700 rounded px-3 py-2 focus:outline-none w-full"
              onClick={createNewChat}
            >
              + New Chat
            </button>
          </div>
          <ul className="flex flex-col space-y-2 overflow-y-auto">
            {chatHistory.length === 0 && <li className="text-gray-400">No chats yet</li>}
            {chatHistory.map((chat) => (
              <li
                key={chat.id}
                onClick={() => selectChat(chat.id)}
                className="cursor-pointer hover:bg-gray-700 rounded px-2 py-1 flex justify-between items-center"
              >
                <span>{chat.title}</span>
                <button
                  className="text-red-500 hover:text-red-700 focus:outline-none"
                  onClick={(e) => handleDeleteChat(e, chat.id)}
                  aria-label={`Delete chat ${chat.title}`}
                >
                  &#x2715;
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
};