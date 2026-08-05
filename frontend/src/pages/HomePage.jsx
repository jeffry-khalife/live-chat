import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useChatData } from '../context/ChatDataContext.jsx';
import OnlineUsers from '../components/OnlineUsers.jsx';
import Sidebar from '../components/Sidebar.jsx';
import Header from '../components/Header.jsx';
import Avatar from '../components/Avatar.jsx';
import useSocket from '../hooks/useSocket.js';
import { getDefaultChannel, mergeChannels, removeChannel } from '../utils/channels.js';
import './home.css';

function formatMessageTime(value) {
    return new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function normalizeMessage(message) {
    if (!message) {
        return null;
    }

    return {
        id: message.id ?? message._id ?? `${Date.now()}`,
        channelId: Number(message.channelId),
        scope: message.scope ?? 'channel',
        authorId: Number(message.authorId ?? message.author?.id ?? 0),
        content: message.content ?? '',
        attachments: message.attachments ?? [],
        reactions: message.reactions ?? [],
        createdAt: message.createdAt ?? new Date().toISOString(),
        editedAt: message.editedAt ?? null,
        deletedAt: message.deletedAt ?? null,
        deletedByAdmin: Boolean(message.deletedByAdmin),
        author: message.author ?? null,
    };
}

function getMessageAuthor(message, currentUser) {
    if (message.author?.pseudo) {
        return message.author.pseudo;
    }

    if (Number(message.authorId) === Number(currentUser?.id) && currentUser?.pseudo) {
        return currentUser.pseudo;
    }

    return 'Utilisateur';
}

function flattenUnreadCounts(servers, unreadCounts) {
    return servers.reduce((accumulator, server) => {
        const unread = server.channels.reduce((sum, channel) => sum + (unreadCounts[channel.id] ?? 0), 0);
        accumulator[server.id] = unread;
        return accumulator;
    }, {});
}

function pickFallbackChannel(channels = [], removedChannelId) {
    return channels.find((channel) => Number(channel.id) !== Number(removedChannelId) && channel.type === 'text')
        ?? channels.find((channel) => Number(channel.id) !== Number(removedChannelId))
        ?? null;
}

function addServerChannel(server, serverId, channel) {
    if (Number(server.id) !== Number(serverId)) {
        return server;
    }
    return { ...server, channels: mergeChannels(server.channels, channel) };
}

function addSelectedChannel(currentSelected, serverId, channel) {
    if (!currentSelected || Number(currentSelected.id) !== Number(serverId)) {
        return currentSelected;
    }
    return { ...currentSelected, channels: mergeChannels(currentSelected.channels, channel) };
}

function canManageSelectedServer(server, currentUser) {
    if (!server || !currentUser?.id) {
        return false;
    }

    if (currentUser.role === 'admin' || Number(server.owner_id) === Number(currentUser.id)) {
        return true;
    }

    return server.members?.[0]?.role === 'admin';
}

function MessageItem({ message, currentUser }) {
    if (Number(message.authorId) === Number(currentUser?.id)) {
        return (
            <div className="msg-group msg-sent">
                <div className="msg-bubble-list">
                    <div className="msg-bubble">{message.content}</div>
                </div>
                <div className="msg-sent-time">{formatMessageTime(message.createdAt)}</div>
            </div>
        );
    }

    return (
        <div className="msg-group msg-received">
            <div className="msg-group-header">
                <Avatar name={message.author?.pseudo ?? getMessageAuthor(message, currentUser)} size={28} />
                <span className="msg-sender">{getMessageAuthor(message, currentUser)}</span>
                <span className="msg-group-time">{formatMessageTime(message.createdAt)}</span>
            </div>
            <div className="msg-bubble-list">
                <div className="msg-bubble">{message.content}</div>
            </div>
        </div>
    );
}

function getTypingLabel(typingUsers) {
    if (typingUsers.length === 0) {
        return '';
    }

    const names = typingUsers.slice(0, 2).join(', ');
    let suffix = '';
    if (typingUsers.length > 2) {
        suffix = '...';
    }

    let verb = 'est';
    if (typingUsers.length > 1) {
        verb = 'sont';
    }

    return `${names}${suffix} ${verb} en train d'écrire...`;
}

function isMobileViewport() {
    return typeof window !== 'undefined' && window.innerWidth <= 768;
}

function HomePage() {
    const { user, token } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const socket = useSocket();
    const { servers, setServers, conversations, setConversations, serverError, statuses } = useChatData();
    const [selected, setSelected] = useState(null); // server object
    const [messages, setMessages] = useState([]);
    const [draft, setDraft] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [newName, setNewName] = useState('');
    const [creating, setCreating] = useState(false);
    const [activeChannel, setActiveChannel] = useState(null);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteSearch, setInviteSearch] = useState('');
    const [showChannelModal, setShowChannelModal] = useState(false);
    const [channelName, setChannelName] = useState('');
    const [channelType, setChannelType] = useState('text');
    const [creatingChannel, setCreatingChannel] = useState(false);
    const [isChannelsSidebarOpen, setIsChannelsSidebarOpen] = useState(true);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [unreadCounts, setUnreadCounts] = useState({});
    const [typingUsers, setTypingUsers] = useState([]);
    const [onlineUsersByServer, setOnlineUsersByServer] = useState({});
    const [selectedConversation, setSelectedConversation] = useState(null);
    const [dmMessages, setDmMessages] = useState([]);
    const [dmUnreadCounts, setDmUnreadCounts] = useState({});
    const [loadingDmMessages, setLoadingDmMessages] = useState(false);
    const [showNewDmModal, setShowNewDmModal] = useState(false);
    const [newDmPseudo, setNewDmPseudo] = useState('');
    const [creatingDm, setCreatingDm] = useState(false);
    const [dmError, setDmError] = useState('');
    const [dmSuggestions, setDmSuggestions] = useState([]);
    const [openMessageMenuId, setOpenMessageMenuId] = useState(null);
    const messagesEndRef = useRef(null);
    const typingTimeoutRef = useRef(null);
    const dmSearchTimeoutRef = useRef(null);
    const selectedId = selected?.id;
    const activeChannelId = activeChannel?.id;
    const selectedConversationId = selectedConversation?.id;

    useEffect(() => {
        if (selected || servers.length === 0) {
            return;
        }

        const firstServer = servers[0];
        setSelected(firstServer);
        setActiveChannel(getDefaultChannel(firstServer));
    }, [servers, selected]);

    useEffect(() => {
        function handleResize() {
            if (!isMobileViewport()) {
                setIsChannelsSidebarOpen(true);
            }
        }

        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, dmMessages]);

    useEffect(() => {
        if (!selectedId || !activeChannelId) {
            setMessages([]);
            setTypingUsers([]);
            return undefined;
        }

        let cancelled = false;
        setLoadingMessages(true);
        setTypingUsers([]);
        setUnreadCounts((currentCounts) => ({
            ...currentCounts,
            [activeChannelId]: 0,
        }));

        fetch(`/api/channels/${activeChannelId}/messages?limit=100`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(async (response) => {
                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                    throw new Error(data.message || 'Impossible de charger les messages.');
                }

                return data;
            })
            .then((data) => {
                if (!cancelled) {
                    setMessages((data.messages ?? []).map(normalizeMessage));
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setMessages([]);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoadingMessages(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [activeChannelId, selectedId, token]);

    useEffect(() => {
        if (!selectedConversationId) {
            setDmMessages([]);
            return undefined;
        }

        let cancelled = false;
        setLoadingDmMessages(true);
        setDmUnreadCounts((currentCounts) => ({ ...currentCounts, [selectedConversationId]: 0 }));

        fetch(`/api/conversations/${selectedConversationId}/messages?limit=100`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(async (response) => {
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(data.message || 'Impossible de charger les messages.');
                }
                return data;
            })
            .then((data) => {
                if (!cancelled) {
                    setDmMessages(data.messages ?? []);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setDmMessages([]);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoadingDmMessages(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [selectedConversationId, token]);

    useEffect(() => {
        if (!showNewDmModal || !token) {
            return undefined;
        }

        clearTimeout(dmSearchTimeoutRef.current);
        dmSearchTimeoutRef.current = setTimeout(() => {
            fetch(`/api/users/search?q=${encodeURIComponent(newDmPseudo.trim())}`, {
                headers: { Authorization: `Bearer ${token}` },
            })
                .then((r) => r.json())
                .then((data) => setDmSuggestions(data.users ?? []))
                .catch(() => setDmSuggestions([]));
        }, 200);

        return () => clearTimeout(dmSearchTimeoutRef.current);
    }, [showNewDmModal, newDmPseudo, token]);

    useEffect(() => {
        if (!socket || !selectedConversationId) {
            return undefined;
        }

        socket.emit('dm:join', { conversationId: selectedConversationId });
    }, [socket, selectedConversationId]);

    useEffect(() => {
        if (!socket || !user?.id) {
            return undefined;
        }

        const handleDmMessage = ({ conversationId, message }) => {
            if (Number(conversationId) === Number(selectedConversationId)) {
                setDmMessages((currentMessages) => [...currentMessages, message]);
                return;
            }

            setDmUnreadCounts((currentCounts) => ({
                ...currentCounts,
                [conversationId]: (currentCounts[conversationId] ?? 0) + 1,
            }));
        };

        socket.on('dm:message', handleDmMessage);

        return () => {
            socket.off('dm:message', handleDmMessage);
        };
    }, [socket, user?.id, selectedConversationId]);

    useEffect(() => {
        if (!socket || !selectedId || !activeChannelId) {
            return undefined;
        }

        const clearTypingUsers = (users = []) => users.filter((name) => name && name !== user?.pseudo);

        const handleJoined = (payload) => {
            if (payload?.typingUsers) {
                setTypingUsers(clearTypingUsers(payload.typingUsers));
            }

            if (payload?.serverId && Array.isArray(payload.onlineUsers)) {
                setOnlineUsersByServer((currentPresence) => ({
                    ...currentPresence,
                    [payload.serverId]: payload.onlineUsers,
                }));
            }
        };

        const handleMessage = ({ channelId, message }) => {
            if (Number(channelId) !== Number(activeChannelId)) {
                setUnreadCounts((currentCounts) => ({
                    ...currentCounts,
                    [channelId]: (currentCounts[channelId] ?? 0) + 1,
                }));
                return;
            }

            setMessages((currentMessages) => [...currentMessages, normalizeMessage(message)]);
        };

        const handleNotification = ({ channelId }) => {
            if (Number(channelId) === Number(activeChannelId)) {
                return;
            }

            setUnreadCounts((currentCounts) => ({
                ...currentCounts,
                [channelId]: (currentCounts[channelId] ?? 0) + 1,
            }));
        };

        const handleTyping = ({ channelId, typingUsers: nextTypingUsers }) => {
            if (Number(channelId) !== Number(activeChannelId)) {
                return;
            }

            setTypingUsers(clearTypingUsers(nextTypingUsers ?? []));
        };

        const handleMessageDeleted = ({ channelId, messageId }) => {
            if (Number(channelId) !== Number(activeChannelId) || !messageId) {
                return;
            }

            setMessages((currentMessages) => currentMessages.filter((message) => String(message.id) !== String(messageId)));
        };

        const handleMessageUpdated = ({ channelId, message }) => {
            if (Number(channelId) !== Number(activeChannelId) || !message?.id) {
                return;
            }

            setMessages((currentMessages) => currentMessages.map((item) => (
                String(item.id) === String(message.id) ? normalizeMessage(message) : item
            )));
        };

        const handleServerMemberRemoved = ({ serverId, userId: removedUserId }) => {
            if (Number(serverId) !== Number(selectedId) || Number(removedUserId) !== Number(user?.id)) {
                return;
            }

            setSelected(null);
            setActiveChannel(null);
            setMessages([]);
            setTypingUsers([]);
            setServers((currentServers) => currentServers.filter((server) => Number(server.id) !== Number(serverId)));
        };

        socket.on('chat:joined', handleJoined);
        socket.on('chat:message', handleMessage);
        socket.on('chat:notification', handleNotification);
        socket.on('chat:typing', handleTyping);
        socket.on('chat:message-deleted', handleMessageDeleted);
        socket.on('chat:message-updated', handleMessageUpdated);
        socket.on('server:member-removed', handleServerMemberRemoved);
        socket.on('server:channel-created', ({ serverId, channel }) => {
            if (Number(selectedId) === Number(serverId)) {
                setSelected((currentSelected) => addSelectedChannel(currentSelected, serverId, channel));
            }
        });
        socket.on('server:channel-deleted', ({ serverId, channelId }) => {
            setSelected((currentSelected) => {
                if (!currentSelected || Number(currentSelected.id) !== Number(serverId)) {
                    return currentSelected;
                }

                const nextChannels = removeChannel(currentSelected.channels, channelId);

                let nextActiveChannel;
                if (Number(activeChannelId) === Number(channelId)) {
                    nextActiveChannel = pickFallbackChannel(nextChannels, channelId);
                } else {
                    nextActiveChannel = currentSelected.channels.find((item) => Number(item.id) === Number(activeChannelId)) ?? null;
                }

                setActiveChannel(nextActiveChannel);
                if (Number(activeChannelId) === Number(channelId)) {
                    setMessages([]);
                    setTypingUsers([]);
                }

                return { ...currentSelected, channels: nextChannels };
            });

            setUnreadCounts((currentCounts) => {
                const nextCounts = { ...currentCounts };
                delete nextCounts[channelId];
                return nextCounts;
            });
        });
        socket.on('server:presence-updated', ({ serverId, onlineUsers }) => {
            if (!Number.isNaN(Number(serverId)) && Array.isArray(onlineUsers)) {
                setOnlineUsersByServer((currentPresence) => ({
                    ...currentPresence,
                    [serverId]: onlineUsers,
                }));
            }
        });
        socket.emit('chat:join', { serverId: selectedId, channelId: activeChannelId }, handleJoined);

        return () => {
            socket.off('chat:joined', handleJoined);
            socket.off('chat:message', handleMessage);
            socket.off('chat:notification', handleNotification);
            socket.off('chat:typing', handleTyping);
            socket.off('chat:message-deleted', handleMessageDeleted);
            socket.off('chat:message-updated', handleMessageUpdated);
            socket.off('server:member-removed', handleServerMemberRemoved);
            socket.off('server:channel-created');
            socket.off('server:channel-deleted');
            socket.off('server:presence-updated');
        };
    }, [activeChannelId, selectedId, socket, user?.id, user?.pseudo]);

    useEffect(() => () => {
        clearTimeout(typingTimeoutRef.current);
    }, []);

    useEffect(() => {
        if (!openMessageMenuId) {
            return undefined;
        }

        function closeMenu() {
            setOpenMessageMenuId(null);
        }

        document.addEventListener('click', closeMenu);
        return () => {
            document.removeEventListener('click', closeMenu);
        };
    }, [openMessageMenuId]);

    async function handleCreateServer(e) {
        e.preventDefault();
        if (!newName.trim() || creating) return;
        setCreating(true);
        try {
            const res = await fetch('/api/servers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ name: newName.trim() }),
            });
            const data = await res.json();
            if (res.ok) {
                setServers((prev) => [...prev, data.server]);
                setSelectedConversation(null);
                setSelected(data.server);
                setActiveChannel(getDefaultChannel(data.server));
                setMessages([]);
                setUnreadCounts((prev) => ({ ...prev, [data.server.id]: 0 }));
                setShowModal(false);
                setNewName('');
            } else {
                alert(data.message || 'Erreur lors de la création du serveur.');
            }
        } catch {
            alert('Erreur réseau lors de la création du serveur.');
        } finally {
            setCreating(false);
        }
    }

    function selectServer(server, channel) {
        setSelectedConversation(null);
        setSelected(server);
        setActiveChannel(channel ?? getDefaultChannel(server));
        setIsChannelsSidebarOpen(true);
        setOpenMessageMenuId(null);
        setMessages([]);
        setTypingUsers([]);
        setUnreadCounts((currentCounts) => ({
            ...currentCounts,
            ...server.channels.reduce((accumulator, channel) => {
                accumulator[channel.id] = 0;
                return accumulator;
            }, {}),
        }));
    }

    function selectChannel(channel) {
        setSelectedConversation(null);
        setActiveChannel(channel);
        setOpenMessageMenuId(null);
        if (isMobileViewport()) {
            setIsChannelsSidebarOpen(false);
        }
        setUnreadCounts((currentCounts) => ({
            ...currentCounts,
            [channel.id]: 0,
        }));
    }

    function selectConversation(conversation) {
        setSelected(null);
        setActiveChannel(null);
        setIsChannelsSidebarOpen(false);
        setOpenMessageMenuId(null);
        setMessages([]);
        setTypingUsers([]);
        setSelectedConversation(conversation);
    }

    async function handleDeleteMessage(message) {
        if (!selected || !activeChannel || !message?.id) {
            return;
        }

        const confirmed = window.confirm('Supprimer ce message ?');
        if (!confirmed) {
            return;
        }

        setOpenMessageMenuId(null);

        try {
            const response = await fetch(`/api/channels/${activeChannel.id}/messages/${message.id}/delete`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                alert(data.message || 'Impossible de supprimer le message.');
                return;
            }

            if (data.message) {
                setMessages((currentMessages) => currentMessages.map((item) => (
                    String(item.id) === String(message.id) ? normalizeMessage(data.message) : item
                )));
                return;
            }

            setMessages((currentMessages) => currentMessages.filter((item) => String(item.id) !== String(message.id)));
        } catch {
            alert('Impossible de supprimer le message.');
        }
    }

    async function handleRemoveUserFromServer(authorId, authorPseudo) {
        if (!selected || !authorId) {
            return;
        }

        const confirmed = window.confirm(`Retirer ${authorPseudo || 'cet utilisateur'} du serveur ?`);
        if (!confirmed) {
            return;
        }

        setOpenMessageMenuId(null);

        try {
            const response = await fetch(`/api/servers/${selected.id}/members/${authorId}/remove`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                alert(data.message || 'Impossible de supprimer l\'utilisateur du serveur.');
                return;
            }

            alert('Utilisateur supprimé du serveur.');
        } catch {
            alert('Impossible de supprimer l\'utilisateur du serveur.');
        }
    }

    useEffect(() => {
        const state = location.state;
        if (!state) return;

        if (state.openServerId) {
            const server = servers.find((s) => Number(s.id) === Number(state.openServerId));
            if (server) {
                const channel = state.openChannelId
                    ? server.channels.find((c) => Number(c.id) === Number(state.openChannelId))
                    : undefined;
                selectServer(server, channel);
                navigate(location.pathname, { replace: true, state: {} });
            }
            return;
        }

        if (state.openConversationId) {
            const conversation = conversations.find((c) => Number(c.id) === Number(state.openConversationId));
            if (conversation) {
                selectConversation(conversation);
                navigate(location.pathname, { replace: true, state: {} });
            }
            return;
        }

        if (state.openNewServerModal) {
            setShowModal(true);
            navigate(location.pathname, { replace: true, state: {} });
            return;
        }

        if (state.openNewDmModal) {
            setShowNewDmModal(true);
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state, servers, conversations]);

    function closeNewDmModal() {
        setShowNewDmModal(false);
        setNewDmPseudo('');
        setDmError('');
        setDmSuggestions([]);
    }

    async function handleCreateConversation(e, pseudoOverride) {
        e?.preventDefault();
        const pseudo = (pseudoOverride ?? newDmPseudo).trim();
        if (!pseudo || creatingDm) return;
        setCreatingDm(true);
        setDmError('');
        try {
            const res = await fetch('/api/conversations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ pseudo }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setDmError(data.message || 'Impossible de créer la conversation.');
                return;
            }
            setConversations((currentConversations) => {
                const exists = currentConversations.some((c) => c.id === data.conversation.id);
                return exists ? currentConversations : [data.conversation, ...currentConversations];
            });
            selectConversation(data.conversation);
            closeNewDmModal();
        } catch {
            setDmError('Impossible de créer la conversation.');
        } finally {
            setCreatingDm(false);
        }
    }

    async function handleInviteMember(pseudo) {
        if (!selected || !pseudo.trim()) return;
        try {
            const res = await fetch(`/api/servers/${selected.id}/members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ pseudo: pseudo.trim() }),
            });
            if (res.ok) {
                setShowInviteModal(false);
                setInviteSearch('');
                alert('Membre invité avec succès!');
            } else {
                const err = await res.json();
                alert(err.message || 'Erreur lors de l\'invitation');
            }
        } catch (err) {
            console.error(err);
            alert('Erreur lors de l\'invitation');
        }
    }

    function openCreateChannelModal(type = 'text') {
        setChannelType(type);
        setChannelName('');
        setShowChannelModal(true);
    }

    async function handleCreateChannel(e) {
        e.preventDefault();

        if (!selected || !channelName.trim() || creatingChannel) {
            return;
        }

        setCreatingChannel(true);

        try {
            const res = await fetch(`/api/servers/${selected.id}/channels`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ name: channelName.trim(), type: channelType }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                alert(data.message || 'Erreur lors de la création du salon');
                return;
            }

            setServers((currentServers) => currentServers.map((server) => addServerChannel(server, selected.id, data.channel)));
            setSelected((currentSelected) => addSelectedChannel(currentSelected, selected.id, data.channel));

            if (channelType === 'text') {
                setActiveChannel(data.channel);
            }

            setShowChannelModal(false);
            setChannelName('');
        } catch {
            alert('Erreur lors de la création du salon');
        } finally {
            setCreatingChannel(false);
        }
    }

    async function handleDeleteChannel(channelId) {
        if (!selected) {
            return;
        }

        const channel = selected.channels.find((item) => Number(item.id) === Number(channelId));
        if (!channel) {
            return;
        }

        const confirmed = window.confirm(`Supprimer le salon #${channel.name} ?`);
        if (!confirmed) {
            return;
        }

        try {
            const res = await fetch(`/api/servers/${selected.id}/channels/${channelId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                alert(data.message || 'Erreur lors de la suppression du salon');
                return;
            }

            setServers((currentServers) => currentServers.map((server) => {
                if (Number(server.id) !== Number(selected.id)) {
                    return server;
                }

                const nextChannels = removeChannel(server.channels, channelId);
                return { ...server, channels: nextChannels };
            }));

            setSelected((currentSelected) => {
                if (!currentSelected || Number(currentSelected.id) !== Number(selected.id)) {
                    return currentSelected;
                }

                const nextChannels = removeChannel(currentSelected.channels, channelId);
                return { ...currentSelected, channels: nextChannels };
            });

            setUnreadCounts((currentCounts) => {
                const nextCounts = { ...currentCounts };
                delete nextCounts[channelId];
                return nextCounts;
            });

            if (Number(activeChannelId) === Number(channelId)) {
                const nextActiveChannel = pickFallbackChannel(removeChannel(selected.channels, channelId), channelId);
                setActiveChannel(nextActiveChannel);
                setMessages([]);
                setTypingUsers([]);
            }
        } catch {
            alert('Erreur lors de la suppression du salon');
        }
    }

    function updateTypingState(isTyping) {
        if (!socket || !selected || !activeChannel || activeChannel.type !== 'text') {
            return;
        }

        socket.emit('chat:typing', {
            serverId: selected.id,
            channelId: activeChannel.id,
            isTyping,
        });
    }

    function handleDraftChange(e) {
        setDraft(e.target.value);

        if (!e.target.value.trim()) {
            clearTimeout(typingTimeoutRef.current);
            updateTypingState(false);
            return;
        }

        updateTypingState(true);
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => updateTypingState(false), 1800);
    }

    async function sendDmMessage(content) {
        if (!selectedConversation) {
            return null;
        }

        const conversationId = selectedConversation.id;

        if (socket) {
            return new Promise((resolve) => {
                socket.emit('dm:message', {
                    conversationId,
                    content,
                }, (response) => {
                    if (response?.ok && response.message && Number(response.message.conversationId) === Number(conversationId)) {
                        setDmMessages((currentMessages) => [...currentMessages, response.message]);
                    }

                    resolve(response);
                });
            });
        }

        const response = await fetch(`/api/conversations/${selectedConversation.id}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ content }),
        });

        const data = await response.json();

        if (response.ok && data.message) {
            setDmMessages((currentMessages) => [...currentMessages, data.message]);
        }

        return data;
    }

    async function sendMessage(content) {
        if (selectedConversation) {
            return sendDmMessage(content);
        }

        if (!selected || !activeChannel) {
            return null;
        }

        if (socket) {
            return new Promise((resolve) => {
                socket.emit('chat:message', {
                    serverId: selected.id,
                    channelId: activeChannel.id,
                    content,
                }, (response) => {
                    if (response?.ok && response.message && Number(response.message.channelId) === Number(activeChannel.id)) {
                        setMessages((currentMessages) => [...currentMessages, normalizeMessage(response.message)]);
                    }

                    resolve(response);
                });
            });
        }

        const response = await fetch(`/api/channels/${activeChannel.id}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ content }),
        });

        const data = await response.json();

        if (response.ok && data.message) {
            setMessages((currentMessages) => [...currentMessages, normalizeMessage(data.message)]);
        }

        return data;
    }

    function handleSend(e) {
        e.preventDefault();
        const canSend = selectedConversation || (selected && activeChannel && activeChannel.type === 'text');
        if (!draft.trim() || !canSend) return;

        const content = draft.trim();
        setDraft('');
        clearTimeout(typingTimeoutRef.current);
        updateTypingState(false);

        sendMessage(content).then((response) => {
            if (!response?.ok) {
                setDraft(content);
                alert(response?.message || 'Erreur lors de l\'envoi du message');
            }
        });
    }

    const unreadByServer = flattenUnreadCounts(servers, unreadCounts);
    const canSendMessage = Boolean(selectedConversation) || Boolean(selected && activeChannel && activeChannel.type === 'text');
    const displayMessages = selectedConversation ? dmMessages : messages;
    const isLoadingDisplayMessages = selectedConversation ? loadingDmMessages : loadingMessages;
    const canManageChannels = canManageSelectedServer(selected, user);
    const canModerateServerMessages = canManageSelectedServer(selected, user);
    const typingLabel = getTypingLabel(typingUsers);

    let messageInputPlaceholder = 'Le salon vocal ne permet pas l\'envoi de messages';
    if (canSendMessage) {
        messageInputPlaceholder = 'Tapez un message...';
    }

    let createServerLabel = 'Créer';
    if (creating) {
        createServerLabel = 'Création...';
    }

    let createChannelLabel = 'Créer';
    if (creatingChannel) {
        createChannelLabel = 'Création...';
    }

    return (
        <div className="page-shell">
            <Header />
            <div className="app-layout">
            <Sidebar
                servers={servers}
                conversations={conversations}
                selected={selected}
                selectedConversation={selectedConversation}
                unreadByServer={unreadByServer}
                dmUnreadCounts={dmUnreadCounts}
                serverError={serverError}
                statuses={statuses}
                onSelectServer={selectServer}
                onSelectConversation={selectConversation}
                onCreateServer={() => setShowModal(true)}
                onCreateDm={() => setShowNewDmModal(true)}
                getDefaultChannel={getDefaultChannel}
            />

            {/* ── Channel sidebar ── */}
            {selected && isChannelsSidebarOpen && isMobileViewport() && (
                <button
                    type="button"
                    aria-label="Fermer la barre latérale"
                    className="channels-backdrop"
                    onClick={() => setIsChannelsSidebarOpen(false)}
                />
            )}

            {selected && (
                <aside className={`channels-sidebar${isChannelsSidebarOpen ? '' : ' is-closed'}`}>
                    {/* Server name header */}
                    <div className="cs-header">
                        <span className="cs-server-name">{selected.name}</span>
                        <svg className="cs-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                        <button className="cs-invite-btn" title="Inviter des membres" onClick={() => setShowInviteModal(true)}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                                <line x1="19" y1="8" x2="19" y2="14" />
                                <line x1="22" y1="11" x2="16" y2="11" />
                            </svg>
                        </button>
                    </div>

                    <div className="cs-divider" />

                    <OnlineUsers users={onlineUsersByServer[selected.id] ?? []} />

                    <div className="cs-divider" />

                    {/* Text channels */}
                    <div className="cs-category">
                        <div className="cs-category-header">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
                            <span>Salons textuels</span>
                            <button className="cs-add-channel" title="Ajouter un salon textuel" onClick={() => openCreateChannelModal('text')}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                            </button>
                        </div>
                        {selected.channels.filter((c) => c.type === 'text').map((c) => {
                            let channelClass = 'cs-channel';
                            if (activeChannel?.id === c.id) {
                                channelClass += ' active';
                            }

                            return (
                                <div
                                    key={c.id}
                                    className={channelClass}
                                    onClick={() => selectChannel(c)}
                                >
                                    <span className="cs-channel-hash">#</span>
                                    <span className="cs-channel-name">{c.name}</span>
                                    {unreadCounts[c.id] > 0 && (
                                        <span className="conv-badge">{unreadCounts[c.id]}</span>
                                    )}
                                    {canManageChannels && (
                                        <div className="cs-channel-actions">
                                            <button
                                                type="button"
                                                className="cs-channel-action-btn"
                                                title="Supprimer le salon"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteChannel(c.id);
                                                }}
                                            >
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M3 6h18" />
                                                    <path d="M8 6V4h8v2" />
                                                    <path d="M6 6l1 14h10l1-14" />
                                                    <path d="M10 11v6" />
                                                    <path d="M14 11v6" />
                                                </svg>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Voice channels */}
                    <div className="cs-category">
                        <div className="cs-category-header">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
                            <span>Salons vocaux</span>
                            <button className="cs-add-channel" title="Ajouter un salon vocal" onClick={() => openCreateChannelModal('voice')}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                            </button>
                        </div>
                        {selected.channels.filter((c) => c.type === 'voice').map((c) => (
                            <div key={c.id} className="cs-channel">
                                <svg className="cs-voice-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                                </svg>
                                <span className="cs-channel-name">{c.name}</span>
                            </div>
                        ))}
                    </div>
                </aside>
            )}

            {showChannelModal && (
                <div className="modal-overlay" onClick={() => setShowChannelModal(false)}>
                    <form
                        className="modal-box"
                        onClick={(e) => e.stopPropagation()}
                        onSubmit={handleCreateChannel}
                    >
                        <h3>Créer un salon</h3>
                        <input
                            type="text"
                            placeholder="Nom du salon"
                            value={channelName}
                            onChange={(e) => setChannelName(e.target.value)}
                            autoFocus
                            maxLength={50}
                        />
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#cbd5e1', fontSize: 13 }}>
                            Type
                            <select
                                value={channelType}
                                onChange={(e) => setChannelType(e.target.value)}
                                style={{
                                    flex: 1,
                                    background: '#0f1623',
                                    color: '#f8fafc',
                                    border: '1px solid #1c2740',
                                    borderRadius: 8,
                                    padding: '8px 10px',
                                    fontFamily: 'inherit',
                                }}
                            >
                                <option value="text">Salon textuel</option>
                                <option value="voice">Salon vocal</option>
                            </select>
                        </label>
                        <div className="modal-actions">
                            <button type="button" className="modal-cancel" onClick={() => setShowChannelModal(false)}>Annuler</button>
                            <button type="submit" className="modal-confirm" disabled={!channelName.trim() || creatingChannel}>
                                {createChannelLabel}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* ── Main chat ── */}
            <main className="chat-main">
                {(selected || selectedConversation) && (
                    <>
                        {/* Contact header */}
                        <div className="chat-contact-header">
                            {selectedConversation ? (
                                <>
                                    <Avatar name={selectedConversation.user.pseudo} size={28} />
                                    <span className="chat-contact-name">{selectedConversation.user.pseudo}</span>
                                </>
                            ) : (
                                <>
                                    {selected && (
                                        <button
                                            type="button"
                                            className="channel-sidebar-toggle"
                                            title={isChannelsSidebarOpen ? 'Fermer la barre latérale' : 'Ouvrir la barre latérale'}
                                            onClick={() => setIsChannelsSidebarOpen((current) => !current)}
                                        >
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <rect x="3" y="4" width="18" height="16" rx="2" />
                                                <line x1="9" y1="4" x2="9" y2="20" />
                                            </svg>
                                        </button>
                                    )}
                                    <span className="cs-channel-hash" style={{ fontSize: 20, color: '#94a3b8' }}>#</span>
                                    <span className="chat-contact-name">{activeChannel?.name ?? selected.name}</span>
                                </>
                            )}
                            <div className="chat-action-btns">
                                <button className="chat-action-btn" title="Appel vocal">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.35 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                                    </svg>
                                </button>
                                <button className="chat-action-btn" title="Appel vidÃ©o">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Messages */}
                        <div className="chat-messages" onClick={() => setOpenMessageMenuId(null)}>
                            {isLoadingDisplayMessages && (
                                <div style={{ color: '#334155', fontSize: 13, textAlign: 'center', marginTop: 'auto' }}>
                                    Chargement de l'historique...
                                </div>
                            )}
                            {!isLoadingDisplayMessages && displayMessages.length === 0 && (
                                <div style={{ color: '#334155', fontSize: 13, textAlign: 'center', marginTop: 'auto' }}>
                                    {selectedConversation ? (
                                        <>Début de la conversation avec <strong style={{ color: '#4fd1e8' }}>{selectedConversation.user.pseudo}</strong></>
                                    ) : (
                                        <>Début de la conversation dans <strong style={{ color: '#4fd1e8' }}>#{activeChannel?.name ?? 'général'}</strong></>
                                    )}
                                </div>
                            )}
                            {displayMessages.map((m) => {
                                const isOwnMessage = Number(m.authorId) === Number(user?.id);
                                const canShowMenu = !selectedConversation && !m.deletedAt && (canModerateServerMessages || isOwnMessage);
                                const canRemoveAuthor = !selectedConversation
                                    && canModerateServerMessages
                                    && !isOwnMessage
                                    && Number(m.authorId) > 0;

                                return (
                                    <div
                                        key={m.id}
                                        className={`msg-group ${isOwnMessage ? 'msg-sent' : 'msg-received'}`}
                                        onClick={(event) => event.stopPropagation()}
                                    >
                                        {!isOwnMessage && (
                                            <div className="msg-group-header">
                                                <Avatar name={m.author?.pseudo ?? getMessageAuthor(m, user)} size={28} />
                                                <span className="msg-sender">{getMessageAuthor(m, user)}</span>
                                                <span className="msg-group-time">{formatMessageTime(m.createdAt)}</span>
                                            </div>
                                        )}

                                        <div className="msg-bubble-list">
                                            <div className="msg-bubble-row">
                                                <div className={`msg-bubble${m.deletedAt ? ' msg-bubble-deleted' : ''}`}>{m.content}</div>
                                                {canShowMenu && (
                                                    <div
                                                        className={`msg-actions-wrap${openMessageMenuId === m.id ? ' is-open' : ''}`}
                                                        onClick={(event) => event.stopPropagation()}
                                                    >
                                                        <button
                                                            type="button"
                                                            className="msg-actions-trigger"
                                                            title="Actions du message"
                                                            onClick={() => setOpenMessageMenuId((currentId) => (currentId === m.id ? null : m.id))}
                                                        >
                                                            <span />
                                                            <span />
                                                            <span />
                                                        </button>
                                                        {openMessageMenuId === m.id && (
                                                            <div className={`msg-actions-menu ${isOwnMessage ? 'align-right' : 'align-left'}`}>
                                                                <button
                                                                    type="button"
                                                                    className="msg-actions-item danger"
                                                                    onClick={() => handleDeleteMessage(m)}
                                                                >
                                                                    Supprimer le message
                                                                </button>
                                                                {canRemoveAuthor && (
                                                                    <button
                                                                        type="button"
                                                                        className="msg-actions-item danger"
                                                                        onClick={() => handleRemoveUserFromServer(m.authorId, getMessageAuthor(m, user))}
                                                                    >
                                                                        Supprimer l'utilisateur
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {isOwnMessage
                                            ? <div className="msg-sent-time">{formatMessageTime(m.createdAt)}</div>
                                            : null}
                                    </div>
                                );
                            })}
                            {!selectedConversation && typingLabel && (
                                <div style={{ color: '#64748b', fontSize: 12, marginLeft: 16, marginTop: 4 }}>
                                    {typingLabel}
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input */}
                        <div className="chat-input-bar">
                            <form className="chat-input-wrap" onSubmit={handleSend}>
                                <input
                                    type="text"
                                    placeholder={messageInputPlaceholder}
                                    value={draft}
                                    onChange={handleDraftChange}
                                    disabled={!canSendMessage}
                                />
                                <button type="submit" className="chat-send-btn" disabled={!canSendMessage}>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="22" y1="2" x2="11" y2="13" />
                                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                                    </svg>
                                </button>
                            </form>
                        </div>
                    </>
                )}
            </main>

            {/* Modale invitation membre */}
            {showInviteModal && (
                <div className="modal-overlay" onClick={() => setShowInviteModal(false)}>
                    <form className="modal-box" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); if (inviteSearch.trim()) handleInviteMember(inviteSearch); }}>
                        <h3>Inviter un membre</h3>
                        <input
                            type="text"
                            placeholder="Pseudo de l'utilisateur"
                            value={inviteSearch}
                            onChange={(e) => setInviteSearch(e.target.value)}
                            autoFocus
                        />
                        <div className="modal-actions">
                            <button type="button" className="modal-cancel" onClick={() => setShowInviteModal(false)}>Annuler</button>
                            <button type="submit" className="modal-confirm" disabled={!inviteSearch.trim()}>Inviter</button>
                        </div>
                    </form>
                </div>
            )}

            {/* Modale nouveau message privé */}
            {showNewDmModal && (
                <div className="modal-overlay" onClick={closeNewDmModal}>
                    <form className="modal-box" onClick={(e) => e.stopPropagation()} onSubmit={handleCreateConversation}>
                        <h3>Nouveau message privé</h3>
                        <input
                            type="text"
                            placeholder="Pseudo de l'utilisateur"
                            value={newDmPseudo}
                            onChange={(e) => setNewDmPseudo(e.target.value)}
                            autoFocus
                        />
                        {dmSuggestions.length > 0 && (
                            <div className="dm-suggestion-list">
                                {dmSuggestions.map((suggestion) => (
                                    <div
                                        key={suggestion.id}
                                        className="dm-suggestion-item"
                                        onClick={() => handleCreateConversation(null, suggestion.pseudo)}
                                    >
                                        <Avatar name={suggestion.pseudo} size={26} />
                                        <span>{suggestion.pseudo}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {dmError && (
                            <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{dmError}</p>
                        )}
                        <div className="modal-actions">
                            <button type="button" className="modal-cancel" onClick={closeNewDmModal}>Annuler</button>
                            <button type="submit" className="modal-confirm" disabled={!newDmPseudo.trim() || creatingDm}>
                                {creatingDm ? 'Création...' : 'Démarrer'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Modale création serveur */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <form className="modal-box" onClick={(e) => e.stopPropagation()} onSubmit={handleCreateServer}>
                        <h3>Nouveau serveur</h3>
                        <input
                            type="text"
                            placeholder="Nom du serveur"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            autoFocus
                            maxLength={50}
                        />
                        <div className="modal-actions">
                            <button type="button" className="modal-cancel" onClick={() => setShowModal(false)}>Annuler</button>
                            <button type="submit" className="modal-confirm" disabled={!newName.trim() || creating}>
                                {createServerLabel}
                            </button>
                        </div>
                    </form>
                </div>
            )}
            </div>
        </div>
    );
}

export default HomePage;
