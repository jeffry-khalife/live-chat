import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import './auth.css';

function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        try {
            await login(email, password);
            navigate('/');
        } catch (err) {
            setError(err.message);
        }
    }

    return (
        <main className="auth-page">
            <div className="auth-card">
                <h1 className="auth-title">
                    RetroComm<span className="auth-title-accent">Live</span>
                </h1>
                <form className="auth-form" onSubmit={handleSubmit}>
                    <h3 className="auth-subtitle">Connexion</h3>
                    <label className="auth-field">
                        <span>Email</span>
                        <input
                            type="email"
                            placeholder="exemple@email.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </label>
                    <label className="auth-field">
                        <span>Mot de passe</span>
                        <input
                            type="password"
                            placeholder="**********"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </label>
                    
                    {error && (
                        <p className="auth-error" role="alert">
                            {error}
                        </p>
                    )}
                    <div className="auth-actions">
                        <Link className="auth-btn auth-btn-register" to="/register">
                            S'inscrire
                        </Link>
                        <button className="auth-btn auth-btn-login" type="submit">
                            Se connecter
                        </button>
                    </div>
                </form>
            </div>
        </main>
    );
}

export default LoginPage;
