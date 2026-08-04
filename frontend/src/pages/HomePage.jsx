import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import OnlineUsers from '../components/OnlineUsers.jsx';
import useSocket from '../hooks/useSocket.js';
import './home.css';

const AVATAR_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6'];

function avatarColor(name = '') {
    return AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];
}

function Avatar({ name = '?', size, style = {} }) {
    let fontSize;
    if (size) {
        fontSize = size * 0.38;
    }

    return (
        <div
            className="conv-avatar"
            style={{ background: avatarColor(name), width: size, height: size, fontSize, ...style }}
        >
            {name[0]?.toUpperCase()}
        </div>
    );
}

function getDefaultChannel(server) {
    return server.channels.find((channel) => channel.type === 'text') ?? server.channels[0] ?? null;
}

function getConversationPreview(server) {
    const defaultChannel = getDefaultChannel(server);
    if (!defaultChannel) {
        return 'Aucun salon';
    }
    return `#${defaultChannel.name}`;
}

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

function mergeChannels(existingChannels = [], incomingChannel) {
    let nextChannels = [incomingChannel];
    if (Array.isArray(incomingChannel)) {
        nextChannels = incomingChannel;
    }

    const merged = [];
    const seenIds = new Set();

    for (const channel of [...existingChannels, ...nextChannels]) {
        if (!channel || seenIds.has(channel.id)) {
            continue;
        }

        seenIds.add(channel.id);
        merged.push(channel);
    }

    return merged;
}

function removeChannel(existingChannels = [], channelId) {
    return existingChannels.filter((channel) => Number(channel.id) !== Number(channelId));
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

function HomePage() {
    const { user, token, logout } = useAuth();
    const navigate = useNavigate();
    const socket = useSocket();
    const [servers, setServers] = useState([]);
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
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [unreadCounts, setUnreadCounts] = useState({});
    const [typingUsers, setTypingUsers] = useState([]);
    const [serverError, setServerError] = useState('');
    const [onlineUsersByServer, setOnlineUsersByServer] = useState({});
    const messagesEndRef = useRef(null);
    const typingTimeoutRef = useRef(null);
    const selectedId = selected?.id;
    const activeChannelId = activeChannel?.id;

    useEffect(() => {
        if (!token) return;
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
        if (selected || servers.length === 0) {
            return;
        }

        const firstServer = servers[0];
        setSelected(firstServer);
        setActiveChannel(getDefaultChannel(firstServer));
    }, [servers, selected]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

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

        socket.on('chat:joined', handleJoined);
        socket.on('chat:message', handleMessage);
        socket.on('chat:notification', handleNotification);
        socket.on('chat:typing', handleTyping);
        socket.on('server:channel-created', ({ serverId, channel }) => {
            setServers((currentServers) => currentServers.map((server) => addServerChannel(server, serverId, channel)));

            if (Number(selectedId) === Number(serverId)) {
                setSelected((currentSelected) => addSelectedChannel(currentSelected, serverId, channel));
            }
        });
        socket.on('server:channel-deleted', ({ serverId, channelId }) => {
            setServers((currentServers) => currentServers.map((server) => {
                if (Number(server.id) !== Number(serverId)) {
                    return server;
                }

                const nextChannels = removeChannel(server.channels, channelId);
                return { ...server, channels: nextChannels };
            }));

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
            socket.off('server:channel-created');
            socket.off('server:channel-deleted');
            socket.off('server:presence-updated');
        };
    }, [activeChannelId, selectedId, socket, user?.pseudo]);

    useEffect(() => () => {
        clearTimeout(typingTimeoutRef.current);
    }, []);

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

    async function sendMessage(content) {
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
        if (!draft.trim() || !selected || !activeChannel || activeChannel.type !== 'text') return;

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

    function selectServer(server) {
        setSelected(server);
        setActiveChannel(getDefaultChannel(server));
        setMessages([]);
        setTypingUsers([]);
        setUnreadCounts((currentCounts) => {
            const resetCounts = {};
            for (const channel of server.channels) {
                resetCounts[channel.id] = 0;
            }
            return { ...currentCounts, ...resetCounts };
        });
    }

    function selectChannel(channel) {
        setActiveChannel(channel);
        setMessages([]);
        setTypingUsers([]);
        setUnreadCounts((currentCounts) => ({ ...currentCounts, [channel.id]: 0 }));
    }

    const initiale = user?.pseudo?.[0]?.toUpperCase() ?? 'A';
    const unreadByServer = flattenUnreadCounts(servers, unreadCounts);
    const canSendMessage = Boolean(selected && activeChannel && activeChannel.type === 'text');
    const canManageChannels = Boolean(selected && (user?.role === 'admin' || Number(selected.owner_id) === Number(user?.id)));
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
        <div className="app-layout">
            {/* â”€â”€ Sidebar â”€â”€ */}
            <aside className="sidebar">
                <nav className="sidebar-topnav">
                    <div className="sidebar-topnav-icons">
                        <button className="snav-btn active" title="Conversations">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                        </button>
                        <button className="snav-btn" title="Profil" onClick={() => navigate('/profile')}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                            </svg>
                        </button>
                        <button className="snav-btn" title="DÃ©connexion" onClick={logout}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                <polyline points="16 17 21 12 16 7" />
                                <line x1="21" y1="12" x2="9" y2="12" />
                            </svg>
                        </button>
                    </div>
                </nav>

                {serverError && (
                    <div className="sidebar-empty" style={{ padding: 16 }}>
                        <span>{serverError}</span>
                    </div>
                )}

                <div className="sidebar-header">
                    <h2>Conversation</h2>
                    <button className="sidebar-add-btn" title="Nouveau serveur" onClick={() => setShowModal(true)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                    </button>
                </div>

                {servers.length === 0 && (
                    <div className="sidebar-empty">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        <span>Aucune conversation</span>
                    </div>
                )}

                {servers.length > 0 && (
                    <div className="conv-list">
                        {servers.map((s) => {
                            let convItemClass = 'conv-item';
                            if (selected?.id === s.id) {
                                convItemClass += ' selected';
                            }

                            return (
                                <div
                                    key={s.id}
                                    className={convItemClass}
                                    onClick={() => selectServer(s)}
                                >
                                    <Avatar name={s.name} />
                                    <div className="conv-body">
                                        <div className="conv-row">
                                            <span className="conv-name">{s.name}</span>
                                            <div className="conv-row" style={{ gap: 8 }}>
                                                {unreadByServer[s.id] > 0 && (
                                                    <span className="conv-badge">{unreadByServer[s.id]}</span>
                                                )}
                                                <span className="conv-time">
                                                    {new Date(s.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="conv-preview-row">
                                            <span className="conv-preview">{getConversationPreview(s)}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </aside>

            {/* ── Channel sidebar ── */}
            {selected && (
                <aside className="channels-sidebar">
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
                {/* Top bar */}
                <div className="chat-topbar">
                    <div className="chat-search">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input type="text" placeholder="Rechercher..." />
                    </div>
                    <div
                        className="chat-user-avatar"
                        title="Mon profil"
                        onClick={() => navigate('/profile')}
                    >
                        {initiale}
                    </div>
                </div>

                {!selected && (
                    <div className="chat-placeholder">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        <span>Sélectionne une conversation</span>
                    </div>
                )}

                {selected && (
                    <>
                        {/* Contact header */}
                        <div className="chat-contact-header">
                            <span className="cs-channel-hash" style={{ fontSize: 20, color: '#94a3b8' }}>#</span>
                            <span className="chat-contact-name">{activeChannel?.name ?? selected.name}</span>
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
                        <div className="chat-messages">
                            {loadingMessages && (
                                <div style={{ color: '#334155', fontSize: 13, textAlign: 'center', marginTop: 'auto' }}>
                                    Chargement de l'historique...
                                </div>
                            )}
                            {!loadingMessages && messages.length === 0 && (
                                <div style={{ color: '#334155', fontSize: 13, textAlign: 'center', marginTop: 'auto' }}>
                                    Début de la conversation dans <strong style={{ color: '#4fd1e8' }}>#{activeChannel?.name ?? 'général'}</strong>
                                </div>
                            )}
                            {messages.map((m) => (
                                <MessageItem key={m.id} message={m} currentUser={user} />
                            ))}
                            {typingLabel && (
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
    );
}

export default HomePage;
