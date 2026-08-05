import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

import { useAuth } from './AuthContext.jsx';

const SocketContext = createContext(null);

function resolveSocketUrl() {
	const baseUrl = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || 'http://localhost:3001';
	return baseUrl.replace(/\/$/, '');
}

export function SocketProvider({ children }) {
	const { token } = useAuth();
	const [socket, setSocket] = useState(null);

	useEffect(() => {
		if (!token) {
			setSocket((currentSocket) => {
				currentSocket?.disconnect();
				return null;
			});
			return undefined;
		}

		const nextSocket = io(resolveSocketUrl(), {
			autoConnect: false,
			transports: ['websocket'],
			auth: { token },
		});

		nextSocket.connect();
		setSocket(nextSocket);

		return () => {
			nextSocket.disconnect();
		};
	}, [token]);

	return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

export function useSocket() {
	return useContext(SocketContext);
}

export default SocketContext;
