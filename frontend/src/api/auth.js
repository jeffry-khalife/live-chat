const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function request(path, body) {
    const res = await fetch(`${API_URL}/api/auth${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
        throw new Error(data.message || 'Une erreur est survenue.');
    }

    return data;
}

export function login(email, password) {
    return request('/login', { email, password });
}

export function register(pseudo, email, password) {
    return request('/register', { pseudo, email, password });
}
