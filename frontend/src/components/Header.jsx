import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useChatData } from '../context/ChatDataContext.jsx';
import Avatar from './Avatar.jsx';
import { API_URL } from '../api/config.js';
import './Header.css';

const STATUS_OPTIONS = [
    { value: 'online', label: 'En ligne' },
    { value: 'away', label: 'Absent' },
    { value: 'dnd', label: 'Ne pas déranger' },
];

function SearchIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
    );
}

function ProfileIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
        </svg>
    );
}

function LogoutIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
    );
}

function Header() {
    const { user, token, logout } = useAuth();
    const { servers, setConversations, myStatus, setMyStatus } = useChatData();
    const navigate = useNavigate();

    const [query, setQuery] = useState('');
    const [userResults, setUserResults] = useState([]);
    const [showResults, setShowResults] = useState(false);
    const [showAccountMenu, setShowAccountMenu] = useState(false);
    const searchTimeoutRef = useRef(null);

    const initial = (user?.pseudo?.[0] || '?').toUpperCase();
    const trimmedQuery = query.trim().toLowerCase();
    const serverResults = trimmedQuery
        ? servers.filter((server) => server.name.toLowerCase().includes(trimmedQuery)).slice(0, 5)
        : [];
    const channelResults = trimmedQuery
        ? servers
            .flatMap((server) => server.channels.map((channel) => ({ channel, server })))
            .filter(({ channel }) => channel.name.toLowerCase().includes(trimmedQuery))
            .slice(0, 5)
        : [];

    useEffect(() => {
        if (!query.trim() || !token) {
            setUserResults([]);
            return undefined;
        }

        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = setTimeout(() => {
            fetch(`${API_URL}/api/users/search?q=${encodeURIComponent(query.trim())}`, {
                headers: { Authorization: `Bearer ${token}` },
            })
                .then((r) => r.json())
                .then((data) => setUserResults(data.users ?? []))
                .catch(() => setUserResults([]));
        }, 200);

        return () => clearTimeout(searchTimeoutRef.current);
    }, [query, token]);

    function closeSearch() {
        setShowResults(false);
        setQuery('');
        setUserResults([]);
    }

    function openServer(server) {
        closeSearch();
        navigate('/', { state: { openServerId: server.id } });
    }

    function openChannel(server, channel) {
        closeSearch();
        navigate('/', { state: { openServerId: server.id, openChannelId: channel.id } });
    }

    async function openConversationWith(pseudo) {
        try {
            const res = await fetch(`${API_URL}/api/conversations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ pseudo }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) return;

            setConversations((current) => {
                const exists = current.some((c) => c.id === data.conversation.id);
                return exists ? current : [data.conversation, ...current];
            });
            closeSearch();
            navigate('/', { state: { openConversationId: data.conversation.id } });
        } catch {
            // silently ignore, user can retry
        }
    }

    return (
        <header className="app-header">
            <div className="app-header-search-wrap">
                <label className="app-header-search">
                    <SearchIcon />
                    <input
                        type="text"
                        placeholder="Rechercher..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onFocus={() => setShowResults(true)}
                    />
                </label>

                {showResults && query.trim() && (
                    <>
                        <div className="app-header-backdrop" onClick={closeSearch} />
                        <div className="app-header-results">
                            {userResults.length === 0 && serverResults.length === 0 && channelResults.length === 0 && (
                                <div className="app-header-results-empty">Aucun résultat</div>
                            )}

                            {userResults.length > 0 && (
                                <div className="app-header-results-group">
                                    <span className="app-header-results-label">Utilisateurs</span>
                                    {userResults.map((result) => (
                                        <div
                                            key={result.id}
                                            className="app-header-result-item"
                                            onClick={() => openConversationWith(result.pseudo)}
                                        >
                                            <Avatar name={result.pseudo} size={28} status={result.status} />
                                            <span>{result.pseudo}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {serverResults.length > 0 && (
                                <div className="app-header-results-group">
                                    <span className="app-header-results-label">Serveurs</span>
                                    {serverResults.map((server) => (
                                        <div
                                            key={server.id}
                                            className="app-header-result-item"
                                            onClick={() => openServer(server)}
                                        >
                                            <Avatar name={server.name} size={28} />
                                            <span>{server.name}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {channelResults.length > 0 && (
                                <div className="app-header-results-group">
                                    <span className="app-header-results-label">Salons</span>
                                    {channelResults.map(({ channel, server }) => (
                                        <div
                                            key={channel.id}
                                            className="app-header-result-item"
                                            onClick={() => openChannel(server, channel)}
                                        >
                                            <span className="app-header-result-hash">#</span>
                                            <span>
                                                {channel.name}
                                                <span className="app-header-result-hint"> dans {server.name}</span>
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            <div className="app-header-account">
                <button
                    type="button"
                    className="app-header-avatar-btn"
                    onClick={() => setShowAccountMenu((current) => !current)}
                >
                    <Avatar name={user?.pseudo ?? initial} size={36} status={myStatus} />
                </button>

                {showAccountMenu && (
                    <>
                        <div className="app-header-backdrop" onClick={() => setShowAccountMenu(false)} />
                        <div className="app-header-menu">
                            <button
                                type="button"
                                className="app-header-menu-item"
                                onClick={() => {
                                    setShowAccountMenu(false);
                                    navigate('/profile');
                                }}
                            >
                                <ProfileIcon />
                                Profil
                            </button>

                            <span className="app-header-menu-label">Statut</span>
                            {STATUS_OPTIONS.map((option) => (
                                <button
                                    type="button"
                                    key={option.value}
                                    className="app-header-menu-item"
                                    onClick={() => {
                                        setMyStatus(option.value);
                                        setShowAccountMenu(false);
                                    }}
                                >
                                    <span className={`app-header-status-dot app-header-status-${option.value}`} />
                                    {option.label}
                                    {myStatus === option.value && <span className="app-header-menu-check">✓</span>}
                                </button>
                            ))}

                            <button
                                type="button"
                                className="app-header-menu-item app-header-menu-item-danger"
                                onClick={() => {
                                    setShowAccountMenu(false);
                                    logout();
                                }}
                            >
                                <LogoutIcon />
                                Déconnexion
                            </button>
                        </div>
                    </>
                )}
            </div>
        </header>
    );
}

export default Header;