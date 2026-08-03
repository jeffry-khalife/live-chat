function OnlineUsers({ users = [] }) {
	return (
		<div className="online-users">
			<div className="online-users-header">Utilisateurs en ligne</div>
			{users.length === 0 ? (
				<div className="online-users-empty">Aucun utilisateur en ligne</div>
			) : (
				<div className="online-users-list">
					{users.map((user) => (
						<div key={user.id} className="online-user-item">
							<div className="online-user-avatar conv-avatar">{user.pseudo?.[0]?.toUpperCase() ?? '?'}</div>
							<div className="online-user-meta">
								<div className="online-user-name">{user.pseudo}</div>
								<div className="online-user-status">
									<span className="online-user-dot" />
									En ligne
								</div>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

export default OnlineUsers;