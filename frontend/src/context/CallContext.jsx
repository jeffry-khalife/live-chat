import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { useSocket } from './SocketContext.jsx';

const CallContext = createContext(null);

function buildIceServers() {
    const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];

    const turnUrl = import.meta.env.VITE_TURN_URL;
    if (turnUrl) {
        iceServers.push({
            urls: turnUrl,
            username: import.meta.env.VITE_TURN_USERNAME,
            credential: import.meta.env.VITE_TURN_CREDENTIAL,
        });
    }

    return { iceServers };
}

const ICE_SERVERS = buildIceServers();

function makeCallId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function CallProvider({ children }) {
    const { user } = useAuth();
    const socket = useSocket();

    const [callState, setCallState] = useState('idle'); // idle | outgoing | incoming | in-call
    const [incomingCall, setIncomingCall] = useState(null);
    const [localStream, setLocalStream] = useState(null);
    const [participants, setParticipants] = useState([]); // [{ userId, pseudo, stream }]
    const [micOn, setMicOn] = useState(true);
    const [cameraOn, setCameraOn] = useState(true);
    const [error, setError] = useState(null);

    const callStateRef = useRef('idle');
    const pcsRef = useRef(new Map()); // userId -> RTCPeerConnection
    const localStreamRef = useRef(null);
    const callIdRef = useRef(null);
    const pendingCandidatesRef = useRef(new Map()); // userId -> candidate[]

    const updateCallState = useCallback((next) => {
        callStateRef.current = next;
        setCallState(next);
    }, []);

    const upsertParticipant = useCallback((userId, patch) => {
        setParticipants((current) => {
            const idx = current.findIndex((p) => p.userId === userId);
            if (idx === -1) {
                return [...current, { userId, pseudo: '', stream: null, ...patch }];
            }
            const next = [...current];
            next[idx] = { ...next[idx], ...patch };
            return next;
        });
    }, []);

    const removeParticipant = useCallback((userId) => {
        pcsRef.current.get(userId)?.close();
        pcsRef.current.delete(userId);
        pendingCandidatesRef.current.delete(userId);
        setParticipants((current) => current.filter((p) => p.userId !== userId));
    }, []);

    const cleanup = useCallback(() => {
        for (const pc of pcsRef.current.values()) pc.close();
        pcsRef.current.clear();
        pendingCandidatesRef.current.clear();
        localStreamRef.current?.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
        setLocalStream(null);
        setParticipants([]);
        setIncomingCall(null);
        callIdRef.current = null;
        setMicOn(true);
        setCameraOn(true);
        updateCallState('idle');
    }, [updateCallState]);

    const createPeerConnection = useCallback((remoteUserId, callId, stream) => {
        const pc = new RTCPeerConnection(ICE_SERVERS);

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('webrtc:ice-candidate', { toUserId: remoteUserId, callId, candidate: event.candidate });
            }
        };

        pc.ontrack = (event) => {
            upsertParticipant(remoteUserId, { stream: event.streams[0] });
        };

        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        pcsRef.current.set(remoteUserId, pc);
        return pc;
    }, [socket, upsertParticipant]);

    const connectToParticipant = useCallback(async (remoteUserId, callId, stream) => {
        const pc = createPeerConnection(remoteUserId, callId, stream);
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('webrtc:offer', { toUserId: remoteUserId, callId, sdp: offer });
        } catch {
            removeParticipant(remoteUserId);
        }
    }, [createPeerConnection, socket, removeParticipant]);

    const getLocalMedia = useCallback(async (video) => {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
        localStreamRef.current = stream;
        setLocalStream(stream);
        return stream;
    }, []);

    const hangUp = useCallback(() => {
        if (socket && callIdRef.current) {
            socket.emit('call:hangup', { callId: callIdRef.current });
        }
        cleanup();
    }, [socket, cleanup]);

    const startCall = useCallback(async (targetUser, video = true) => {
        if (!socket || !targetUser?.id || callStateRef.current !== 'idle') return;

        const callId = makeCallId();
        callIdRef.current = callId;
        setCameraOn(video);
        updateCallState('outgoing');
        setError(null);
        upsertParticipant(targetUser.id, { pseudo: targetUser.pseudo });

        try {
            await getLocalMedia(video);
            socket.emit('call:invite', {
                toUserId: targetUser.id,
                callId,
                video,
                fromUser: { id: user.id, pseudo: user.pseudo },
            });
        } catch {
            setError('Impossible d\'accéder à la caméra/micro.');
            cleanup();
        }
    }, [socket, user, getLocalMedia, upsertParticipant, cleanup, updateCallState]);

    const inviteToCall = useCallback((targetUser) => {
        if (!socket || callStateRef.current !== 'in-call' || !callIdRef.current) return;
        if (targetUser.id === user?.id) return;
        if (participants.some((p) => p.userId === targetUser.id)) return;

        socket.emit('call:invite-more', {
            toUserId: targetUser.id,
            callId: callIdRef.current,
            video: cameraOn,
            fromUser: { id: user.id, pseudo: user.pseudo },
        });
    }, [socket, user, cameraOn, participants]);

    const acceptCall = useCallback(async () => {
        if (!incomingCall || !socket) return;

        const { callId, video, participants: existingParticipants } = incomingCall;
        callIdRef.current = callId;
        setCameraOn(video);
        setIncomingCall(null);
        updateCallState('in-call');
        setError(null);

        existingParticipants.forEach((p) => upsertParticipant(p.id, { pseudo: p.pseudo }));

        try {
            await getLocalMedia(video);
            // Each existing participant creates the offer to us once they learn we've joined
            // (see onParticipantJoined) — we just need our media ready and wait for their offers.
            socket.emit('call:accept', { callId, fromUser: { id: user.id, pseudo: user.pseudo } });
        } catch {
            setError('Impossible d\'accéder à la caméra/micro.');
            hangUp();
        }
    }, [incomingCall, socket, user, getLocalMedia, upsertParticipant, hangUp, updateCallState]);

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
            if (callStateRef.current === 'idle') {
                setIncomingCall(payload);
                updateCallState('incoming');
                return;
            }

            if (callStateRef.current === 'in-call' && payload.callId === callIdRef.current) {
                // We're already in this call (invite-more targeted someone else) — ignore.
                return;
            }

            socket.emit('call:decline', { toUserId: payload.fromUser.id, callId: payload.callId });
        }

        function onDeclined() {
            setError('Appel refusé.');
            if (callStateRef.current !== 'in-call') {
                cleanup();
            }
        }

        function onHangup({ callId }) {
            if (callId === callIdRef.current) {
                cleanup();
            }
        }

        function onUnavailable() {
            setError('Utilisateur injoignable.');
            if (callStateRef.current !== 'in-call') {
                cleanup();
            }
        }

        function onParticipantJoined({ callId, user: joinedUser }) {
            if (callId !== callIdRef.current || !localStreamRef.current) return;
            upsertParticipant(joinedUser.id, { pseudo: joinedUser.pseudo });
            updateCallState('in-call');
            connectToParticipant(joinedUser.id, callId, localStreamRef.current);
        }

        function onParticipantLeft({ callId, userId: leftUserId }) {
            if (callId !== callIdRef.current) return;
            removeParticipant(leftUserId);
        }

        async function onOffer({ fromUserId, callId, sdp }) {
            if (callId !== callIdRef.current || !localStreamRef.current) return;
            try {
                let pc = pcsRef.current.get(fromUserId);
                if (!pc) {
                    pc = createPeerConnection(fromUserId, callId, localStreamRef.current);
                }
                await pc.setRemoteDescription(new RTCSessionDescription(sdp));
                const pending = pendingCandidatesRef.current.get(fromUserId) || [];
                for (const candidate of pending) {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                }
                pendingCandidatesRef.current.delete(fromUserId);
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                socket.emit('webrtc:answer', { toUserId: fromUserId, callId, sdp: answer });
                updateCallState('in-call');
            } catch {
                setError('Erreur lors de l\'établissement de l\'appel.');
            }
        }

        async function onAnswer({ fromUserId, callId, sdp }) {
            const pc = pcsRef.current.get(fromUserId);
            if (!pc || callId !== callIdRef.current) return;
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(sdp));
                const pending = pendingCandidatesRef.current.get(fromUserId) || [];
                for (const candidate of pending) {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                }
                pendingCandidatesRef.current.delete(fromUserId);
            } catch {
                setError('Erreur lors de l\'établissement de l\'appel.');
            }
        }

        async function onIceCandidate({ fromUserId, callId, candidate }) {
            if (callId !== callIdRef.current || !candidate) return;
            const pc = pcsRef.current.get(fromUserId);
            try {
                if (pc && pc.remoteDescription) {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } else {
                    const pending = pendingCandidatesRef.current.get(fromUserId) || [];
                    pending.push(candidate);
                    pendingCandidatesRef.current.set(fromUserId, pending);
                }
            } catch {
                // ignore malformed/late candidates
            }
        }

        socket.on('call:incoming', onIncoming);
        socket.on('call:declined', onDeclined);
        socket.on('call:hangup', onHangup);
        socket.on('call:unavailable', onUnavailable);
        socket.on('call:participant-joined', onParticipantJoined);
        socket.on('call:participant-left', onParticipantLeft);
        socket.on('webrtc:offer', onOffer);
        socket.on('webrtc:answer', onAnswer);
        socket.on('webrtc:ice-candidate', onIceCandidate);

        return () => {
            socket.off('call:incoming', onIncoming);
            socket.off('call:declined', onDeclined);
            socket.off('call:hangup', onHangup);
            socket.off('call:unavailable', onUnavailable);
            socket.off('call:participant-joined', onParticipantJoined);
            socket.off('call:participant-left', onParticipantLeft);
            socket.off('webrtc:offer', onOffer);
            socket.off('webrtc:answer', onAnswer);
            socket.off('webrtc:ice-candidate', onIceCandidate);
        };
    }, [socket, cleanup, createPeerConnection, connectToParticipant, upsertParticipant, removeParticipant, updateCallState]);

    return (
        <CallContext.Provider
            value={{
                callState,
                incomingCall,
                localStream,
                participants,
                micOn,
                cameraOn,
                error,
                startCall,
                inviteToCall,
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
