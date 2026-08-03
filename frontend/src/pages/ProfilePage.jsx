import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { updateProfile } from '../api/profile.js';
import './profile.css';

function PencilIcon() {
    return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 20h9" strokeLinecap="round" strokeLinejoin="round" />
            <path
                d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function Avatar({ letter, size = 'lg', status = 'online' }) {
    return <div className={`profile-avatar profile-avatar-${size} profile-avatar-${status}`}>{letter}</div>;
}

const STATUS_OPTIONS = [
    { value: 'online', label: 'En ligne' },
    { value: 'away', label: 'Absent' },
    { value: 'dnd', label: 'Ne pas déranger' },
    { value: 'offline', label: 'Hors ligne' },
];

function ProfilePage() {
    const { user, token, updateUser } = useAuth();
    const initial = (user?.pseudo?.[0] || '?').toUpperCase();

    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState('online');
    const [showStatusMenu, setShowStatusMenu] = useState(false);

    function selectStatus(value) {
        setStatus(value);
        setShowStatusMenu(false);
    }

    const [showUsernameModal, setShowUsernameModal] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [modalError, setModalError] = useState('');

    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [passwordModalError, setPasswordModalError] = useState('');

    function openUsernameModal() {
        setModalError('');
        setNewUsername('');
        setShowUsernameModal(true);
    }

    function closeUsernameModal() {
        setShowUsernameModal(false);
        setNewUsername('');
        setModalError('');
    }

    async function handleUsernameConfirm() {
        if (!newUsername.trim() || newUsername === user?.pseudo) {
            setModalError('Veuillez saisir un nouveau nom d\'utilisateur.');
            return;
        }
        setSaving(true);
        setModalError('');
        try {
            const data = await updateProfile(token, { pseudo: newUsername });
            updateUser(data.user);
            closeUsernameModal();
        } catch (err) {
            setModalError(err.message);
        } finally {
            setSaving(false);
        }
    }

    function openPasswordModal() {
        setPasswordModalError('');
        setCurrentPassword('');
        setNewPassword('');
        setShowPasswordModal(true);
    }

    function closePasswordModal() {
        setShowPasswordModal(false);
        setCurrentPassword('');
        setNewPassword('');
        setPasswordModalError('');
    }

    async function handlePasswordConfirm() {
        if (!currentPassword || !newPassword) {
            setPasswordModalError('Veuillez remplir les deux champs.');
            return;
        }
        setSaving(true);
        setPasswordModalError('');
        try {
            await updateProfile(token, { password: newPassword, currentPassword });
            closePasswordModal();
        } catch (err) {
            setPasswordModalError(err.message);
        } finally {
            setSaving(false);
        }
    }

    return (
        <>
        <main className="profile-main">
            <div className="profile-avatar-wrap">
                <button
                    type="button"
                    className="profile-avatar-trigger"
                    onClick={() => setShowStatusMenu((v) => !v)}
                >
                    <Avatar letter={initial} size="lg" status={status} />
                </button>

                {showStatusMenu && (
                    <>
                        <div className="profile-status-backdrop" onClick={() => setShowStatusMenu(false)} />
                        <ul className="profile-status-menu">
                            {STATUS_OPTIONS.map((option) => (
                                <li key={option.value}>
                                    <button
                                        type="button"
                                        className="profile-status-option"
                                        onClick={() => selectStatus(option.value)}
                                    >
                                        <span className={`profile-status-dot profile-status-dot-${option.value}`} />
                                        {option.label}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </div>

            <form className="profile-form" onSubmit={(e) => e.preventDefault()}>
                <label className="profile-field">
                    <span>Nom d'utilisateur</span>
                    <span className="profile-input-wrap">
                        <input type="text" value={user?.pseudo || ''} disabled />
                        <button
                            type="button"
                            className="profile-edit-btn"
                            onClick={openUsernameModal}
                            disabled={saving}
                        >
                            <PencilIcon />
                        </button>
                    </span>
                </label>

                <label className="profile-field">
                    <span>Email</span>
                    <span className="profile-input-wrap">
                        <input type="email" value={user?.email || ''} disabled />
                    </span>
                </label>

                <label className="profile-field">
                    <span>Mot de passe</span>
                    <span className="profile-input-wrap">
                        <input type="password" value="**********" disabled />
                        <button
                            type="button"
                            className="profile-edit-btn"
                            onClick={openPasswordModal}
                            disabled={saving}
                        >
                            <PencilIcon />
                        </button>
                    </span>
                </label>
            </form>
        </main>

        {showUsernameModal && (
            <div className="profile-modal-overlay">
                <div className="profile-modal">
                    <h3 className="profile-modal-title">Modifier le nom d'utilisateur</h3>

                    <label className="profile-modal-field">
                        <span>Ancien nom d'utilisateur</span>
                        <input type="text" value={user?.pseudo || ''} disabled />
                    </label>

                    <label className="profile-modal-field">
                        <span>Nouveau nom d'utilisateur</span>
                        <input
                            type="text"
                            value={newUsername}
                            onChange={(e) => setNewUsername(e.target.value)}
                            disabled={saving}
                            autoFocus
                        />
                    </label>

                    {modalError && (
                        <p className="profile-error" role="alert">
                            {modalError}
                        </p>
                    )}

                    <div className="profile-modal-actions">
                        <button
                            type="button"
                            className="profile-btn profile-btn-secondary"
                            onClick={closeUsernameModal}
                            disabled={saving}
                        >
                            Retour
                        </button>
                        <button
                            type="button"
                            className="profile-btn profile-btn-primary"
                            onClick={handleUsernameConfirm}
                            disabled={saving}
                        >
                            Confirmer
                        </button>
                    </div>
                </div>
            </div>
        )}

        {showPasswordModal && (
            <div className="profile-modal-overlay">
                <div className="profile-modal">
                    <h3 className="profile-modal-title">Modifier le mot de passe</h3>

                    <label className="profile-modal-field">
                        <span>Ancien mot de passe</span>
                        <input
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            disabled={saving}
                            autoFocus
                        />
                    </label>

                    <label className="profile-modal-field">
                        <span>Nouveau mot de passe</span>
                        <input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            disabled={saving}
                        />
                    </label>

                    {passwordModalError && (
                        <p className="profile-error" role="alert">
                            {passwordModalError}
                        </p>
                    )}

                    <div className="profile-modal-actions">
                        <button
                            type="button"
                            className="profile-btn profile-btn-secondary"
                            onClick={closePasswordModal}
                            disabled={saving}
                        >
                            Retour
                        </button>
                        <button
                            type="button"
                            className="profile-btn profile-btn-primary"
                            onClick={handlePasswordConfirm}
                            disabled={saving}
                        >
                            Confirmer
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}

export default ProfilePage;