import { useEffect, useRef } from 'react';
import { useCall } from '../context/CallContext.jsx';

function VideoTile({ stream, muted, label, isSelf }) {
    const videoRef = useRef(null);

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.srcObject = stream ?? null;
        }
    }, [stream]);

    return (
        <div className={`call-tile${isSelf ? ' call-tile-self' : ''}`}>
            <video ref={videoRef} autoPlay playsInline muted={muted} />
            <div className="call-tile-label">{label}</div>
        </div>
    );
}

function CallPanel() {
    const {
        callState,
        incomingCall,
        localStream,
        participants,
        micOn,
        cameraOn,
        error,
        acceptCall,
        declineCall,
        hangUp,
        toggleMic,
        toggleCamera,
    } = useCall();

    if (callState === 'idle') {
        return error ? (
            <div className="call-toast">{error}</div>
        ) : null;
    }

    if (callState === 'incoming' && incomingCall) {
        return (
            <div className="modal-overlay">
                <div className="modal-box call-incoming-box">
                    <h3>Appel entrant</h3>
                    <p className="call-incoming-name">{incomingCall.fromUser.pseudo}</p>
                    <div className="modal-actions">
                        <button type="button" className="modal-cancel" onClick={declineCall}>Refuser</button>
                        <button type="button" className="modal-confirm" onClick={acceptCall}>Accepter</button>
                    </div>
                </div>
            </div>
        );
    }

    const headerLabel = callState === 'outgoing'
        ? `Appel de ${participants[0]?.pseudo ?? '...'}...`
        : participants.map((p) => p.pseudo).filter(Boolean).join(', ');

    return (
        <div className="call-panel">
            <div className="call-panel-header">{headerLabel}</div>
            <div className="call-panel-grid">
                {participants.map((p) => (
                    <VideoTile key={p.userId} stream={p.stream} label={p.pseudo} />
                ))}
                <VideoTile stream={localStream} muted isSelf label="Moi" />
            </div>
            <div className="call-panel-controls">
                <button type="button" className={`call-control-btn${micOn ? '' : ' call-control-off'}`} onClick={toggleMic} title="Micro">
                    {micOn ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                            <line x1="12" y1="19" x2="12" y2="23" />
                            <line x1="8" y1="23" x2="16" y2="23" />
                        </svg>
                    ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="1" y1="1" x2="23" y2="23" />
                            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                            <path d="M17 16.95A7 7 0 0 1 5 12v-2" />
                            <path d="M19 10v2a6.99 6.99 0 0 1-.11 1.23" />
                            <line x1="12" y1="19" x2="12" y2="23" />
                            <line x1="8" y1="23" x2="16" y2="23" />
                        </svg>
                    )}
                </button>
                <button type="button" className={`call-control-btn${cameraOn ? '' : ' call-control-off'}`} onClick={toggleCamera} title="Caméra">
                    {cameraOn ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                        </svg>
                    ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2.5" />
                            <path d="M10.66 5H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                    )}
                </button>
                <button type="button" className="call-control-btn call-control-hangup" onClick={hangUp} title="Raccrocher">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1-1a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 17.61V20.6a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4 2.63h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11l-1.27 1.27" />
                        <line x1="23" y1="1" x2="1" y2="23" />
                    </svg>
                </button>
            </div>
        </div>
    );
}

export default CallPanel;
