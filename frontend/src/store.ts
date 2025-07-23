import { configureStore, createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatHistoryItem {
  id: number;
  title: string;
  messages: Message[];
}

interface AuthState {
  user: string | null;
  authView: 'login' | 'signup' | 'chat';
}

interface ChatState {
  chatHistory: ChatHistoryItem[];
  currentChatId: number | null;
  messages: Message[];
  loading: boolean;
  isSidebarOpen: boolean;
}

const initialAuthState: AuthState = {
  user: null,
  authView: 'login',
};

const initialChatState: ChatState = {
  chatHistory: [],
  currentChatId: null,
  messages: [],
  loading: false,
  isSidebarOpen: true,
};

export const deleteChat = createAsyncThunk(
  'chat/deleteChat',
  async (id: number, { getState, dispatch }) => {
    const state = getState() as { auth: AuthState; chat: ChatState };
    const user = state.auth.user;
    if (!user) throw new Error('User not logged in');
    const response = await fetch(`http://localhost:8000/chat/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete chat');
    // After deletion, update chat history in state
    const updatedChats = state.chat.chatHistory.filter(chat => chat.id !== id);
    dispatch(setChatHistory(updatedChats));
    if (state.chat.currentChatId === id) {
      dispatch(setMessages([]));
      dispatch(setCurrentChatId(null));
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState: initialAuthState,
  reducers: {
    login(state, action: PayloadAction<string>) {
      state.user = action.payload;
      state.authView = 'chat';
    },
    logout(state) {
      state.user = null;
      state.authView = 'login';
    },
    switchToLogin(state) {
      state.authView = 'login';
    },
    switchToSignup(state) {
      state.authView = 'signup';
    },
  },
});

const chatSlice = createSlice({
  name: 'chat',
  initialState: initialChatState,
  reducers: {
    toggleSidebar(state) {
      state.isSidebarOpen = !state.isSidebarOpen;
    },
    selectChat(state, action: PayloadAction<number>) {
      const chat = state.chatHistory.find((c) => c.id === action.payload);
      if (chat) {
        state.currentChatId = action.payload;
        state.messages = chat.messages;
      }
    },
    addNewChat(state) {
      const newChat: ChatHistoryItem = {
        id: Date.now(),
        title: `Chat ${state.chatHistory.length + 1}`,
        messages: [],
      };
      state.chatHistory.unshift(newChat);
      state.currentChatId = newChat.id;
      state.messages = [];
    },
    setMessages(state, action: PayloadAction<Message[]>) {
      state.messages = action.payload;
    },
    setLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
    updateChatHistory(state, action: PayloadAction<{ id: number; messages: Message[] }>) {
      state.chatHistory = state.chatHistory.map((chat) =>
        chat.id === action.payload.id ? { ...chat, messages: action.payload.messages } : chat
      );
    },
    setChatHistory(state, action: PayloadAction<ChatHistoryItem[]>) {
      state.chatHistory = action.payload;
    },
    setCurrentChatId(state, action: PayloadAction<number | null>) {
      state.currentChatId = action.payload;
    },
    clearChat(state) {
      state.chatHistory = [];
      state.currentChatId = null;
      state.messages = [];
      state.loading = false;
      state.isSidebarOpen = true;
    },
  },
});

export const {
  login,
  logout,
  switchToLogin,
  switchToSignup,
} = authSlice.actions;

export const {
  toggleSidebar,
  selectChat,
  addNewChat,
  setMessages,
  setLoading,
  updateChatHistory,
  setChatHistory,
  setCurrentChatId,
  clearChat,
} = chatSlice.actions;

export const store = configureStore({
  reducer: {
    auth: authSlice.reducer,
    chat: chatSlice.reducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
