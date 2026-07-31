import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

function ProfilePage() {
    const { user, logout } = useAuth();

    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [status, setStatus] = useState('Online');

    const [username, setUsername] = useState(user?.pseudo || '');
    const [email, setEmail] = useState(user?.email || '');
    const [password, setPassword] = useState('');

    const [editUsername, setEditUsername] = useState(false);
    const [editEmail, setEditEmail] = useState(false);
    const [editPassword, setEditPassword] = useState(false);

    return (
        <div>
            <aside>
                <p>{user?.pseudo}</p>
                <p>{user?.email}</p>

                <p>Profile</p>
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="Online">Online</option>
                    <option value="Away">Away</option>
                    <option value="Do not disturb">Do not disturb</option>
                </select>

                <button type="button" onClick={() => setShowLogoutConfirm(true)}>
                    Log out
                </button>

                {showLogoutConfirm && (
                    <div>
                        <p>Are you sure you want to log out?</p>
                        <button type="button" onClick={logout}>
                            Log out
                        </button>
                        <button type="button" onClick={() => setShowLogoutConfirm(false)}>
                            Cancel
                        </button>
                    </div>
                )}
            </aside>

            <main>
                <input type="search" placeholder="Search..." />

                <p>Username</p>
                <input
                    type="text"
                    value={username}
                    disabled={!editUsername}
                    onChange={(e) => setUsername(e.target.value)}
                />
                <button type="button" onClick={() => setEditUsername(!editUsername)}>
                    {editUsername ? 'Save' : 'Edit'}
                </button>

                <p>Email</p>
                <input
                    type="email"
                    value={email}
                    disabled={!editEmail}
                    onChange={(e) => setEmail(e.target.value)}
                />
                <button type="button" onClick={() => setEditEmail(!editEmail)}>
                    {editEmail ? 'Save' : 'Edit'}
                </button>

                <p>Password</p>
                <input
                    type="password"
                    value={password}
                    disabled={!editPassword}
                    onChange={(e) => setPassword(e.target.value)}
                />
                <button type="button" onClick={() => setEditPassword(!editPassword)}>
                    {editPassword ? 'Save' : 'Edit'}
                </button>
            </main>
        </div>
    );
}

export default ProfilePage;
