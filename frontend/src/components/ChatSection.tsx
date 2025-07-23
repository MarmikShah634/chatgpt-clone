import React, { useState, useEffect, useRef } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatSectionProps {
  messages: Message[];
  onSendMessage: (message: string) => void;
  loading: boolean;
}

const ChatSection: React.FC<ChatSectionProps> = ({
  messages,
  onSendMessage,
  loading,
}) => {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleSend = () => {
    if (input.trim() === "") return;
    onSendMessage(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  return (
    <div className="flex flex-col flex-grow p-4 bg-gray-900 h-full max-h-[90%]">
      <div className="flex-grow overflow-y-auto mb-4 max-h-full flex flex-col">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`mb-2 p-3 rounded-lg break-words ${
              msg.role === "user"
                ? "bg-blue-600 text-white self-end text-left max-w-xl mr-2"
                : "bg-gray-700 text-white self-start text-left max-w-xl"
            }`}
            style={{ width: "fit-content" }}
          >
            {msg.content}
          </div>
        ))}
        {loading && (
          <div className="mb-2 p-3 rounded-lg max-w-xl bg-gray-700 self-start animate-pulse text-left">
            <div className="text-white">Generating answer...</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your message..."
          rows={2}
          className="flex-grow p-2 rounded bg-gray-800 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-white"
        />
        <button
          onClick={handleSend}
          disabled={loading || input.trim() === ""}
          className="ml-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatSection;
