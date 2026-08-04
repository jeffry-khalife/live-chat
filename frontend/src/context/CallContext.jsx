import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { useSocket } from './SocketContext.jsx';

const CallContext = createContext(null);

const ICE_SERVERS = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

function makeCallId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function CallProvider({ children }) {
    const { user } = useAuth();
    const socket = useSocket();

    const [callState, setCallState] = useState('idle'); // idle | outgoing | incoming | in-call
    const [remoteUser, setRemoteUser] = useState(null);
    const [incomingCall, setIncomingCall] = useState(null);
    const [localStream, setLocalStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [micOn, setMicOn] = useState(true);
    const [cameraOn, setCameraOn] = useState(true);
    const [error, setError] = useState(null);

    const callStateRef = useRef('idle');
    const pcRef = useRef(null);
    const localStreamRef = useRef(null);
    const callIdRef = useRef(null);
    const remoteUserIdRef = useRef(null);
    const pendingCandidatesRef = useRef([]);

    const updateCallState = useCallback((next) => {
        callStateRef.current = next;
        setCallState(next);
    }, []);

    const cleanup = useCallback(() => {
        pcRef.current?.close();
        pcRef.current = null;
        localStreamRef.current?.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
        setLocalStream(null);
        setRemoteStream(null);
        setRemoteUser(null);
        setIncomingCall(null);
        callIdRef.current = null;
        remoteUserIdRef.current = null;
        pendingCandidatesRef.current = [];
        setMicOn(true);
        setCameraOn(true);
        updateCallState('idle');
    }, [updateCallState]);

    const createPeerConnection = useCallback((targetUserId, callId) => {
        const pc = new RTCPeerConnection(ICE_SERVERS);

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('webrtc:ice-candidate', { toUserId: targetUserId, callId, candidate: event.candidate });
            }
        };

        pc.ontrack = (event) => {
            setRemoteStream(event.streams[0]);
        };

        pcRef.current = pc;
        return pc;
    }, [socket]);

    const getLocalMedia = useCallback(async (video) => {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
        localStreamRef.current = stream;
        setLocalStream(stream);
        return stream;
    }, []);

    const hangUp = useCallback(() => {
        if (socket && remoteUserIdRef.current && callIdRef.current) {
            socket.emit('call:hangup', { toUserId: remoteUserIdRef.current, callId: callIdRef.current });
        }
        cleanup();
    }, [socket, cleanup]);

    const startCall = useCallback(async (targetUser, video = true) => {
        if (!socket || !targetUser?.id || callStateRef.current !== 'idle') return;

        const callId = makeCallId();
        callIdRef.current = callId;
        remoteUserIdRef.current = targetUser.id;
        setRemoteUser(targetUser);
        setCameraOn(video);
        updateCallState('outgoing');
        setError(null);

        try {
            const stream = await getLocalMedia(video);
            const pc = createPeerConnection(targetUser.id, callId);
            stream.getTracks().forEach((track) => pc.addTrack(track, stream));

            socket.emit('call:invite', {
                toUserId: targetUser.id,
                callId,
                video,
                fromUser: { id: user.id, pseudo: user.pseudo },
            });
        } catch (err) {
            setError('Impossible d\'accéder à la caméra/micro.');
            cleanup();
        }
    }, [socket, user, getLocalMedia, createPeerConnection, cleanup, updateCallState]);

    const acceptCall = useCallback(async () => {
        if (!incomingCall || !socket) return;

        const { callId, fromUser, video } = incomingCall;
        callIdRef.current = callId;
        remoteUserIdRef.current = fromUser.id;
        setRemoteUser(fromUser);
        setCameraOn(video);
        setIncomingCall(null);
        updateCallState('in-call');
        setError(null);

        try {
            const stream = await getLocalMedia(video);
            const pc = createPeerConnection(fromUser.id, callId);
            stream.getTracks().forEach((track) => pc.addTrack(track, stream));

            socket.emit('call:accept', { toUserId: fromUser.id, callId });
        } catch (err) {
            setError('Impossible d\'accéder à la caméra/micro.');
            hangUp();
        }
    }, [incomingCall, socket, getLocalMedia, createPeerConnection, hangUp, updateCallState]);

    const declineCall = useCallback(() => {
        if (!incomingCall || !socket) return;
        socket.emit('call:decline', { toUserId: incomingCall.fromUser.id, callId: incomingCall.callId });
        setIncomingCall(null);
        updateCallState('idle');
    }, [incomingCall, socket, updateCallState]);

    const toggleMic = useCallback(() => {
        if (!localStreamRef.current) return;
        setMicOn((current) => {
            const next = !current;
            localStreamRef.current.getAudioTracks().forEach((track) => { track.enabled = next; });
            return next;
        });
    }, []);

    const toggleCamera = useCallback(() => {
        if (!localStreamRef.current) return;
        setCameraOn((current) => {
            const next = !current;
            localStreamRef.current.getVideoTracks().forEach((track) => { track.enabled = next; });
            return next;
        });
    }, []);

    useEffect(() => {
        if (!socket) return undefined;

        function onIncoming(payload) {
            if (callStateRef.current !== 'idle') {
                socket.emit('call:decline', { toUserId: payload.fromUser.id, callId: payload.callId });
                return;
            }
            setIncomingCall(payload);
            updateCallState('incoming');
        }

        async function onAccepted({ fromUserId, callId }) {
            if (callId !== callIdRef.current || !pcRef.current) return;
            try {
                const pc = pcRef.current;
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit('webrtc:offer', { toUserId: fromUserId, callId, sdp: offer });
                updateCallState('in-call');
            } catch (err) {
                setError('Erreur lors de l\'établissement de l\'appel.');
                hangUp();
            }
        }

        function onDeclined() {
            setError('Appel refusé.');
            cleanup();
        }

        function onHangup({ callId }) {
            if (callId === callIdRef.current) {
                cleanup();
            }
        }

        function onUnavailable() {
            setError('Utilisateur injoignable.');
            cleanup();
        }

        async function onOffer({ fromUserId, callId, sdp }) {
            const pc = pcRef.current;
            if (!pc || callId !== callIdRef.current || fromUserId !== remoteUserIdRef.current) return;
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(sdp));
                for (const candidate of pendingCandidatesRef.current) {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                }
                pendingCandidatesRef.current = [];
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                socket.emit('webrtc:answer', { toUserId: fromUserId, callId, sdp: answer });
            } catch (err) {
                setError('Erreur lors de l\'établissement de l\'appel.');
            }
        }

        async function onAnswer({ fromUserId, callId, sdp }) {
            const pc = pcRef.current;
            if (!pc || callId !== callIdRef.current || fromUserId !== remoteUserIdRef.current) return;
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(sdp));
                for (const candidate of pendingCandidatesRef.current) {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                }
                pendingCandidatesRef.current = [];
            } catch (err) {
                setError('Erreur lors de l\'établissement de l\'appel.');
            }
        }

        async function onIceCandidate({ fromUserId, callId, candidate }) {
            const pc = pcRef.current;
            if (!pc || callId !== callIdRef.current || fromUserId !== remoteUserIdRef.current || !candidate) return;
            try {
                if (pc.remoteDescription) {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } else {
                    pendingCandidatesRef.current.push(candidate);
                }
            } catch (err) {
                // ignore malformed/late candidates
            }
        }

        socket.on('call:incoming', onIncoming);
        socket.on('call:accepted', onAccepted);
        socket.on('call:declined', onDeclined);
        socket.on('call:hangup', onHangup);
        socket.on('call:unavailable', onUnavailable);
        socket.on('webrtc:offer', onOffer);
        socket.on('webrtc:answer', onAnswer);
        socket.on('webrtc:ice-candidate', onIceCandidate);

        return () => {
            socket.off('call:incoming', onIncoming);
            socket.off('call:accepted', onAccepted);
            socket.off('call:declined', onDeclined);
            socket.off('call:hangup', onHangup);
            socket.off('call:unavailable', onUnavailable);
            socket.off('webrtc:offer', onOffer);
            socket.off('webrtc:answer', onAnswer);
            socket.off('webrtc:ice-candidate', onIceCandidate);
        };
    }, [socket, cleanup, hangUp, updateCallState]);

    return (
        <CallContext.Provider
            value={{
                callState,
                remoteUser,
                incomingCall,
                localStream,
                remoteStream,
                micOn,
                cameraOn,
                error,
                startCall,
                acceptCall,
                declineCall,
                hangUp,
                toggleMic,
                toggleCamera,
            }}
        >
            {children}
        </CallContext.Provider>
    );
}

CallContext.displayName = 'CallContext';

export function useCall() {
    return useContext(CallContext);
}

export default CallContext;
