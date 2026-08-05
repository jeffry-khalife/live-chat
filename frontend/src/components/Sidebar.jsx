import { useState } from 'react';
import Avatar from './Avatar.jsx';
import './Sidebar.css';

function ChatIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
    );
}

function ServerIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="7" rx="1.5" />
            <rect x="2" y="14" width="20" height="7" rx="1.5" />
            <line x1="6" y1="6.5" x2="6.01" y2="6.5" />
            <line x1="6" y1="17.5" x2="6.01" y2="17.5" />
        </svg>
    );
}

function CollapseIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
        </svg>
    );
}

function PlusIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
    );
}

function Sidebar({
    servers,
    conversations,
    selected,
    selectedConversation,
    unreadByServer,
    dmUnreadCounts,
    serverError,
    statuses = {},
    onSelectServer,
    onSelectConversation,
    onCreateServer,
    onCreateDm,
    getDefaultChannel,
}) {
    const [view, setView] = useState('dm');
    const [collapsed, setCollapsed] = useState(() => window.innerWidth <= 768);

    function openView(nextView) {
        setView(nextView);
        setCollapsed(false);
    }

    function collapseOnMobile() {
        if (window.innerWidth <= 768) {
            setCollapsed(true);
        }
    }

    function handleSelectServer(server) {
        onSelectServer(server);
        collapseOnMobile();
    }

    function handleSelectConversation(conversation) {
        onSelectConversation(conversation);
        collapseOnMobile();
    }

    return (
        <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
            <div className="sidebar-rail">
                <button
                    type="button"
                    className={`sidebar-rail-btn${!collapsed && view === 'dm' ? ' active' : ''}`}
                    title="Messages privés"
                    onClick={() => openView('dm')}
                >
                    <ChatIcon />
                </button>
                <button
                    type="button"
                    className={`sidebar-rail-btn${!collapsed && view === 'servers' ? ' active' : ''}`}
                    title="Serveurs"
                    onClick={() => openView('servers')}
                >
                    <ServerIcon />
                </button>
                <button
                    type="button"
                    className="sidebar-rail-btn sidebar-rail-collapse"
                    title={collapsed ? 'Afficher les conversations' : 'Réduire'}
                    onClick={() => setCollapsed((current) => !current)}
                >
                    <CollapseIcon />
                </button>
            </div>

            {!collapsed && (
                <div className="sidebar-panel">
                    {view === 'servers' ? (
                        <>
                            {serverError && (
                                <div className="sidebar-empty" style={{ padding: 16 }}>
                                    <span>{serverError}</span>
                                </div>
                            )}
                            <div className="sidebar-header">
                                <h2>Serveurs</h2>
                                <button className="sidebar-add-btn" title="Nouveau serveur" onClick={onCreateServer}>
                                    <PlusIcon />
                                </button>
                            </div>
                            {servers.length === 0 ? (
                                <div className="sidebar-empty">
                                    <ServerIcon />
                                    <span>Aucun serveur</span>
                                </div>
                            ) : (
                                <div className="conv-list">
                                    {servers.map((s) => (
                                        <div
                                            key={s.id}
                                            className={`conv-item${!selectedConversation && selected?.id === s.id ? ' selected' : ''}`}
                                            onClick={() => handleSelectServer(s)}
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
                                                    <span className="conv-preview">
                                                        {getDefaultChannel(s) ? `#${getDefaultChannel(s).name}` : 'Aucun salon'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            <div className="sidebar-header">
                                <h2>Messages privés</h2>
                                <button className="sidebar-add-btn" title="Nouveau message privé" onClick={onCreateDm}>
                                    <PlusIcon />
                                </button>
                            </div>
                            {conversations.length === 0 ? (
                                <div className="sidebar-empty">
                                    <ChatIcon />
                                    <span>Aucune conversation privée</span>
                                </div>
                            ) : (
                                <div className="conv-list">
                                    {conversations.map((c) => (
                                        <div
                                            key={c.id}
                                            className={`conv-item${selectedConversation?.id === c.id ? ' selected' : ''}`}
                                            onClick={() => handleSelectConversation(c)}
                                        >
                                            <Avatar name={c.user.pseudo} status={statuses[c.user.id] ?? c.user.status} />
                                            <div className="conv-body">
                                                <div className="conv-row">
                                                    <span className="conv-name">{c.user.pseudo}</span>
                                                    {dmUnreadCounts[c.id] > 0 && (
                                                        <span className="conv-badge">{dmUnreadCounts[c.id]}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </aside>
    );
}

export default Sidebar;