import { API_URL } from './config.js';

export async function updateProfile(token, updates) {
    const res = await fetch(`${API_URL}/api/profile`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
    });

    const data = await res.json();

    if (!res.ok) {
        throw new Error(data.message || 'Une erreur est survenue.');
    }

    return data;
}
