import { useAuth } from '../context/AuthContext.jsx';
import { useCall } from '../context/CallContext.jsx';

function OnlineUsers({ users = [] }) {
	const { user } = useAuth();
	const { startCall, inviteToCall, callState, participants } = useCall();

	const inCall = callState === 'in-call';

	return (
		<div className="online-users">
			<div className="online-users-header">Utilisateurs en ligne</div>
			{users.length === 0 ? (
				<div className="online-users-empty">Aucun utilisateur en ligne</div>
			) : (
				<div className="online-users-list">
					{users.map((onlineUser) => {
						const isSelf = onlineUser.id === user?.id;
						const alreadyInCall = participants.some((p) => p.userId === onlineUser.id);

						return (
							<div key={onlineUser.id} className="online-user-item">
								<div className="online-user-avatar conv-avatar">{onlineUser.pseudo?.[0]?.toUpperCase() ?? '?'}</div>
								<div className="online-user-meta">
									<div className="online-user-name">{onlineUser.pseudo}</div>
									<div className="online-user-status">
										<span className="online-user-dot" />
										En ligne
									</div>
								</div>
								{!isSelf && !alreadyInCall && (
									<button
										type="button"
										className="online-user-call-btn"
										title={inCall ? `Inviter ${onlineUser.pseudo} à l'appel` : `Appeler ${onlineUser.pseudo}`}
										disabled={callState !== 'idle' && !inCall}
										onClick={() => (inCall ? inviteToCall(onlineUser) : startCall(onlineUser, true))}
									>
										{inCall ? (
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
											<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
										</svg>
									) : (
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
											<polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
										</svg>
									)}
									</button>
								)}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

export default OnlineUsers;
