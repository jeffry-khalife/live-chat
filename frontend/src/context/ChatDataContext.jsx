import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import useSocket from '../hooks/useSocket.js';
import { mergeChannels, removeChannel } from '../utils/channels.js';

const ChatDataContext = createContext(null);

export function ChatDataProvider({ children }) {
    const { user, token } = useAuth();
    const socket = useSocket();
    const [servers, setServers] = useState([]);
    const [conversations, setConversations] = useState([]);
    const [serverError, setServerError] = useState('');
    const [myStatus, setMyStatusState] = useState('online');
    const [statuses, setStatuses] = useState({});

    function setMyStatus(status) {
        setMyStatusState(status);
        socket?.emit('status:set', { status });
    }

    useEffect(() => {
        if (!token) {
            setServers([]);
            return;
        }

        setServerError('');
        fetch('/api/servers', { headers: { Authorization: `Bearer ${token}` } })
            .then(async (r) => {
                const data = await r.json().catch(() => ({}));
                if (!r.ok) {
                    throw new Error(data.message || 'Impossible de charger les serveurs.');
                }
                return data;
            })
            .then((data) => setServers(data.servers ?? []))
            .catch((error) => {
                setServers([]);
                setServerError(error.message || 'Le serveur est indisponible.');
            });
    }, [token]);

    useEffect(() => {
        if (!token) {
            setConversations([]);
            return;
        }

        fetch('/api/conversations', { headers: { Authorization: `Bearer ${token}` } })
            .then(async (r) => {
                const data = await r.json().catch(() => ({}));
                if (!r.ok) {
                    throw new Error(data.message || 'Impossible de charger les conversations.');
                }
                return data;
            })
            .then((data) => {
                const nextConversations = data.conversations ?? [];
                setConversations(nextConversations);
                setStatuses((current) => nextConversations.reduce((accumulator, conversation) => {
                    accumulator[conversation.user.id] = conversation.user.status;
                    return accumulator;
                }, { ...current }));
            })
            .catch(() => setConversations([]));
    }, [token]);

    useEffect(() => {
        if (!socket) {
            return undefined;
        }

        function handleSelfStatus({ status }) {
            setMyStatusState(status);
        }

        function handleStatusUpdated({ userId, status }) {
            if (user?.id && Number(userId) === Number(user.id)) {
                setMyStatusState(status);
                return;
            }

            setStatuses((current) => ({ ...current, [userId]: status }));
        }

        socket.on('status:self', handleSelfStatus);
        socket.on('status:updated', handleStatusUpdated);

        return () => {
            socket.off('status:self', handleSelfStatus);
            socket.off('status:updated', handleStatusUpdated);
        };
    }, [socket, user?.id]);

    useEffect(() => {
        if (!socket) {
            return undefined;
        }

        function handleChannelCreated({ serverId, channel }) {
            setServers((currentServers) => currentServers.map((server) => (
                Number(server.id) === Number(serverId)
                    ? { ...server, channels: mergeChannels(server.channels, channel) }
                    : server
            )));
        }

        function handleChannelDeleted({ serverId, channelId }) {
            setServers((currentServers) => currentServers.map((server) => (
                Number(server.id) === Number(serverId)
                    ? { ...server, channels: removeChannel(server.channels, channelId) }
                    : server
            )));
        }

        socket.on('server:channel-created', handleChannelCreated);
        socket.on('server:channel-deleted', handleChannelDeleted);

        return () => {
            socket.off('server:channel-created', handleChannelCreated);
            socket.off('server:channel-deleted', handleChannelDeleted);
        };
    }, [socket]);

    return (
        <ChatDataContext.Provider
            value={{
                servers,
                setServers,
                conversations,
                setConversations,
                serverError,
                myStatus,
                setMyStatus,
                statuses,
            }}
        >
            {children}
        </ChatDataContext.Provider>
    );
}

export function useChatData() {
    return useContext(ChatDataContext);
}

export default ChatDataContext;