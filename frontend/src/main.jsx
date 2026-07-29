import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ChatPanel from './components/ChatPanel.jsx';
import ServerBar from './components/ServerBar.jsx';
import ChannelList from './components/ChannelList.jsx';
import CallPanel from './components/CallPanel.jsx';

function App() {
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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
