import { createContext, useContext, useEffect, useRef, useState } from 'react';
import * as authApi from '../api/auth.js';

const AuthContext = createContext(null);

const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // access token expires after 15min

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        const stored = localStorage.getItem('user');
        return stored ? JSON.parse(stored) : null;
    });
    const [token, setToken] = useState(() => localStorage.getItem('token'));
    const [refreshToken, setRefreshToken] = useState(() => localStorage.getItem('refreshToken'));
    const refreshTokenRef = useRef(refreshToken);
    refreshTokenRef.current = refreshToken;

    function persist(user, token, refreshToken) {
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('token', token);
        localStorage.setItem('refreshToken', refreshToken);
        setUser(user);
        setToken(token);
        setRefreshToken(refreshToken);
    }

    async function login(email, password) {
        const data = await authApi.login(email, password);
        persist(data.user, data.token, data.refreshToken);
    }

    async function register(pseudo, email, password) {
        const data = await authApi.register(pseudo, email, password);
        persist(data.user, data.token, data.refreshToken);
    }

    function logout() {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        setUser(null);
        setToken(null);
        setRefreshToken(null);
    }

    useEffect(() => {
        if (!refreshToken) return undefined;

        const silentRefresh = async () => {
            try {
                const data = await authApi.refresh(refreshTokenRef.current);
                persist(data.user, data.token, data.refreshToken);
            } catch {
                logout();
            }
        };

        const interval = setInterval(silentRefresh, REFRESH_INTERVAL_MS);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [Boolean(refreshToken)]);

    return (
        <AuthContext.Provider value={{ user, token, refreshToken, login, register, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}

export default AuthContext;
