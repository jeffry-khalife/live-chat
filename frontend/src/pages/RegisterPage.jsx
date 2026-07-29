import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

function RegisterPage() {
    const { register } = useAuth();
    const navigate = useNavigate();
    const [pseudo, setPseudo] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        try {
            await register(pseudo, email, password);
            navigate('/');
        } catch (err) {
            setError(err.message);
        }
    }

    return (
        <main>
            <h1>Inscription</h1>
            <form onSubmit={handleSubmit}>
                <label>
                    Pseudo
                    <input type="text" value={pseudo} onChange={(e) => setPseudo(e.target.value)} required />
                </label>
                <label>
                    Email
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </label>
                <label>
                    Mot de passe
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </label>
                {error && <p role="alert">{error}</p>}
                <button type="submit">S'inscrire</button>
            </form>
            <p>
                Déjà un compte ? <Link to="/login">Se connecter</Link>
            </p>
        </main>
    );
}

export default RegisterPage;
