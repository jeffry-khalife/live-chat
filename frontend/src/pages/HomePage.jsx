import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import './home.css';

const AVATAR_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6'];

function avatarColor(name = '') {
    return AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];
}

function Avatar({ name = '?', size, style = {} }) {
    return (
        <div
            className="conv-avatar"
            style={{ background: avatarColor(name), width: size, height: size, fontSize: size ? size * 0.38 : undefined, ...style }}
        >
            {name[0]?.toUpperCase()}
        </div>
    );
}

function HomePage() {
    const { user, token, logout } = useNavigate ? useAuth() : { user: null, token: null, logout: () => {} };
    const navigate = useNavigate();
    const [servers, setServers] = useState([]);
    const [selected, setSelected] = useState(null); // server object
    const [messages, setMessages] = useState([]);   // future: from socket
    const [draft, setDraft] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [newName, setNewName] = useState('');
    const [creating, setCreating] = useState(false);
    const [activeChannel, setActiveChannel] = useState(null);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteSearch, setInviteSearch] = useState('');
    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (!token) return;
        fetch('/api/servers', { headers: { Authorization: `Bearer ${token}` } })
            .then((r) => r.json())
            .then((data) => setServers(data.servers ?? []))
            .catch(() => {});
    }, [token]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

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
                setActiveChannel(data.server.channels[0] ?? null);
                setMessages([]);
            }
        } finally {
            setCreating(false);
            setShowModal(false);
            setNewName('');
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
            alert('Erreur lors de l\'invitation');
        }
    }

    function handleSend(e) {
        e.preventDefault();
        if (!draft.trim() || !selected) return;
        // TODO: Ã©mettre via socket
        setMessages((prev) => [
            ...prev,
            { id: Date.now(), text: draft.trim(), sent: true, time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) },
        ]);
        setDraft('');
    }

    const initiale = user?.pseudo?.[0]?.toUpperCase() ?? 'A';

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

                <div className="sidebar-header">
                    <h2>Conversation</h2>
                    <button className="sidebar-add-btn" title="Nouveau serveur" onClick={() => setShowModal(true)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                    </button>
                </div>

                {servers.length === 0 ? (
                    <div className="sidebar-empty">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        <span>Aucune conversation</span>
                    </div>
                ) : (
                    <div className="conv-list">
                        {servers.map((s) => (
                            <div
                                key={s.id}
                                className={`conv-item${selected?.id === s.id ? ' selected' : ''}`}
                                onClick={() => { setSelected(s); setActiveChannel(s.channels[0] ?? null); setMessages([]); }}
                            >
                                <Avatar name={s.name} />
                                <div className="conv-body">
                                    <div className="conv-row">
                                        <span className="conv-name">{s.name}</span>
                                        <span className="conv-time">
                                            {new Date(s.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <div className="conv-preview-row">
                                        <span className="conv-preview">
                                            {s.channels[0] ? `#${s.channels[0].name}` : 'Aucun salon'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
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

                    {/* Text channels */}
                    <div className="cs-category">
                        <div className="cs-category-header">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
                            <span>Salons textuels</span>
                            <button className="cs-add-channel" title="Ajouter un salon textuel">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                            </button>
                        </div>
                        {selected.channels.filter((c) => c.type === 'text').map((c) => (
                            <div
                                key={c.id}
                                className={`cs-channel${activeChannel?.id === c.id ? ' active' : ''}`}
                                onClick={() => { setActiveChannel(c); setMessages([]); }}
                            >
                                <span className="cs-channel-hash">#</span>
                                <span className="cs-channel-name">{c.name}</span>
                                <div className="cs-channel-actions">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
                                    </svg>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="3" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
                                    </svg>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Voice channels */}
                    <div className="cs-category">
                        <div className="cs-category-header">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
                            <span>Salons vocaux</span>
                            <button className="cs-add-channel" title="Ajouter un salon vocal">
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

                {selected ? (
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
                            {messages.length === 0 && (
                                <div style={{ color: '#334155', fontSize: 13, textAlign: 'center', marginTop: 'auto' }}>
                                    DÃ©but de la conversation dans <strong style={{ color: '#4fd1e8' }}>#{selected.channels[0]?.name ?? 'gÃ©nÃ©ral'}</strong>
                                </div>
                            )}
                            {messages.map((m) =>
                                m.sent ? (
                                    <div key={m.id} className="msg-group msg-sent">
                                        <div className="msg-bubble-list">
                                            <div className="msg-bubble">{m.text}</div>
                                        </div>
                                        <div className="msg-sent-time">{m.time}</div>
                                    </div>
                                ) : (
                                    <div key={m.id} className="msg-group msg-received">
                                        <div className="msg-group-header">
                                            <Avatar name={m.sender ?? '?'} size={28} />
                                            <span className="msg-sender">{m.sender}</span>
                                            <span className="msg-group-time">{m.time}</span>
                                        </div>
                                        <div className="msg-bubble-list">
                                            <div className="msg-bubble">{m.text}</div>
                                        </div>
                                    </div>
                                )
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input */}
                        <div className="chat-input-bar">
                            <form className="chat-input-wrap" onSubmit={handleSend}>
                                <input
                                    type="text"
                                    placeholder="Tapez un message..."
                                    value={draft}
                                    onChange={(e) => setDraft(e.target.value)}
                                />
                                <button type="submit" className="chat-send-btn">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="22" y1="2" x2="11" y2="13" />
                                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                                    </svg>
                                </button>
                            </form>
                        </div>
                    </>
                ) : (
                    <div className="chat-placeholder">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        <span>SÃ©lectionne une conversation</span>
                    </div>
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
                                {creating ? 'Création...' : 'Créer'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}

export default HomePage;