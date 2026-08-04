import './Avatar.css';

const AVATAR_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6'];

function avatarColor(name = '') {
    return AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];
}

function Avatar({ name = '?', size, status, style = {} }) {
    return (
        <div className="avatar-wrap">
            <div
                className="conv-avatar"
                style={{ background: avatarColor(name), width: size, height: size, fontSize: size ? size * 0.38 : undefined, ...style }}
            >
                {name[0]?.toUpperCase()}
            </div>
            {status && <span className={`avatar-status-dot avatar-status-${status}`} />}
        </div>
    );
}

export default Avatar;