import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import ChatPanel from './components/ChatPanel.jsx';
import ServerBar from './components/ServerBar.jsx';
import ChannelList from './components/ChannelList.jsx';
import CallPanel from './components/CallPanel.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';

function ChatLayout() {
  return (
    <main>
      <h1>live-chat-discord</h1>
      <ServerBar />
      <ChannelList />
      <ChatPanel />
      <CallPanel />
    </main>
  );
}

function ProtectedRoute({ children }) {
  const { token } = useAuth();
  return token ? children : <Navigate to="/login" replace />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <ChatLayout />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
