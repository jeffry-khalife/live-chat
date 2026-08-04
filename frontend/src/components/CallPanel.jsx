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
                    {micOn ? '🎙️' : '🔇'}
                </button>
                <button type="button" className={`call-control-btn${cameraOn ? '' : ' call-control-off'}`} onClick={toggleCamera} title="Caméra">
                    {cameraOn ? '📷' : '📷🚫'}
                </button>
                <button type="button" className="call-control-btn call-control-hangup" onClick={hangUp} title="Raccrocher">
                    📞
                </button>
            </div>
        </div>
    );
}

export default CallPanel;
