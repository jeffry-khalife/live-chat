import { useState } from 'react';

const API_URL = 'http://localhost:3000/api/auth';

async function callApi(path, body) {
  const res = await fetch(`${API_URL}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Erreur');
  return data;
}

function App() {
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [registerPseudo, setRegisterPseudo] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [message, setMessage] = useState('');

  async function handleLogin(e) {
    e.preventDefault();
    try {
      const data = await callApi('login', { email: loginEmail, password: loginPassword });
      localStorage.setItem('token', data.token);
      setMessage(`Connecté en tant que ${data.user.pseudo}`);
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    try {
      const data = await callApi('register', {
        pseudo: registerPseudo,
        email: registerEmail,
        password: registerPassword,
      });
      localStorage.setItem('token', data.token);
      setMessage(`Compte créé pour ${data.user.pseudo}`);
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <>
      <h1>Live Chat</h1>

      <h2>Connexion</h2>
      <form onSubmit={handleLogin}>
        <input
          type="email"
          placeholder="Email"
          value={loginEmail}
          onChange={(e) => setLoginEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Mot de passe"
          value={loginPassword}
          onChange={(e) => setLoginPassword(e.target.value)}
          required
        />
        <button type="submit">Se connecter</button>
      </form>

      <h2>Inscription</h2>
      <form onSubmit={handleRegister}>
        <input
          type="text"
          placeholder="Pseudo"
          value={registerPseudo}
          onChange={(e) => setRegisterPseudo(e.target.value)}
          required
        />
        <input
          type="email"
          placeholder="Email"
          value={registerEmail}
          onChange={(e) => setRegisterEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Mot de passe"
          value={registerPassword}
          onChange={(e) => setRegisterPassword(e.target.value)}
          required
        />
        <button type="submit">S'inscrire</button>
      </form>

      <p>{message}</p>
    </>
  );
}

export default App;
