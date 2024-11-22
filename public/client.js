// Constants and configuration
const CONFIG = {
    MAX_RECONNECTION_ATTEMPTS: 3,
    RECONNECTION_DELAY: 2000,
    ICE_GATHERING_TIMEOUT: 5000,
    MAX_PARTICIPANTS: 10,
    ROOM_CODE_LENGTH: 10
};

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ],
    iceCandidatePoolSize: 10
};

// DOM Elements with error checking
const getDOMElement = (id) => {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Element with id '${id}' not found`);
    return element;
};

const UI = {
    landingPage: getDOMElement('landing-page'),
    callPage: getDOMElement('call-page'),
    createRoomBtn: getDOMElement('create-room'),
    joinRoomBtn: getDOMElement('join-room'),
    roomCodeInput: getDOMElement('room-code-input'),
    usernameInput: getDOMElement('username-input'),
    generatedRoomCode: getDOMElement('generated-room-code'),
    roomCodeText: getDOMElement('room-code-text'),
    copyRoomCodeBtn: getDOMElement('copy-room-code'),
    participantsList: getDOMElement('participants-list'),
    muteBtn: getDOMElement('mute-btn'),
    hangupBtn: getDOMElement('hangup-btn'),
    speakerBtn: getDOMElement('speaker-btn')
};

// State management
class CallState {
    constructor() {
        this.localStream = null;
        this.peerConnection = null;
        this.currentRoom = null;
        this.currentUsername = null;
        this.participants = new Map();
        this.isCallConnected = false;
        this.reconnectionAttempts = 0;
        this.deviceChangeListeners = new Set();
        this.audioElements = new Set();
        this.isMuted = false;
        this.isReconnecting = false;
    }

    reset() {
        this.localStream = null;
        this.peerConnection = null;
        this.currentRoom = null;
        this.isCallConnected = false;
        this.reconnectionAttempts = 0;
        this.isReconnecting = false;
        this.clearAudioElements();
    }

    clearAudioElements() {
        this.audioElements.forEach(element => element.remove());
        this.audioElements.clear();
    }
}

const state = new CallState();

// WebRTC utilities
class WebRTCHandler {
    static async createPeerConnection() {
        const pc = new RTCPeerConnection(ICE_SERVERS);
        
        // ICE gathering timeout
        let gatheringComplete = false;
        const iceGatheringTimeout = setTimeout(() => {
            if (!gatheringComplete) {
                console.warn('ICE gathering timed out');
                pc.dispatchEvent(new Event('icegatheringcomplete'));
            }
        }, CONFIG.ICE_GATHERING_TIMEOUT);

        pc.addEventListener('iceconnectionstatechange', () => {
            console.log('ICE connection state:', pc.iceConnectionState);
            switch (pc.iceConnectionState) {
                case 'failed':
                    this.handleConnectionFailure();
                    break;
                case 'disconnected':
                    this.initiateReconnection();
                    break;
                case 'connected':
                    state.isCallConnected = true;
                    state.reconnectionAttempts = 0;
                    break;
            }
        });

        pc.addEventListener('icegatheringstatechange', () => {
            if (pc.iceGatheringState === 'complete') {
                gatheringComplete = true;
                clearTimeout(iceGatheringTimeout);
            }
        });

        return pc;
    }

    static async handleConnectionFailure() {
        if (state.reconnectionAttempts < CONFIG.MAX_RECONNECTION_ATTEMPTS) {
            state.reconnectionAttempts++;
            console.log(`Attempting reconnection (${state.reconnectionAttempts}/${CONFIG.MAX_RECONNECTION_ATTEMPTS})`);
            await this.initiateReconnection();
        } else {
            NotificationManager.show('Call connection failed. Please try again.', 'error');
            CallManager.endCall();
        }
    }

    static async initiateReconnection() {
        if (state.isReconnecting) return;
        state.isReconnecting = true;

        try {
            await new Promise(resolve => setTimeout(resolve, CONFIG.RECONNECTION_DELAY));
            await CallManager.restartCall();
        } catch (error) {
            console.error('Reconnection failed:', error);
        } finally {
            state.isReconnecting = false;
        }
    }
}

// Media handling
class MediaHandler {
    static async getUserMedia() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }, 
                video: false 
            });
            
            this.setupDeviceChangeListeners();
            return stream;
        } catch (error) {
            if (error.name === 'NotAllowedError') {
                NotificationManager.show('Microphone access denied. Please check your permissions.', 'error');
            } else {
                NotificationManager.show('Error accessing microphone. Please check your audio device.', 'error');
            }
            throw error;
        }
    }

    static setupDeviceChangeListeners() {
        navigator.mediaDevices.addEventListener('devicechange', async () => {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const audioDevices = devices.filter(device => device.kind === 'audioinput');
                
                if (audioDevices.length === 0) {
                    NotificationManager.show('No audio input devices found', 'warning');
                    return;
                }

                // Notify device change listeners
                state.deviceChangeListeners.forEach(listener => listener(audioDevices));
            } catch (error) {
                console.error('Error handling device change:', error);
            }
        });
    }

    static async handleDeviceChange() {
        if (!state.localStream) return;

        try {
            const newStream = await this.getUserMedia();
            const audioTrack = newStream.getAudioTracks()[0];
            
            if (state.peerConnection) {
                const sender = state.peerConnection.getSenders()
                    .find(s => s.track && s.track.kind === 'audio');
                if (sender) {
                    await sender.replaceTrack(audioTrack);
                }
            }

            state.localStream.getAudioTracks().forEach(track => track.stop());
            state.localStream = newStream;
        } catch (error) {
            console.error('Error handling device change:', error);
            NotificationManager.show('Error switching audio device', 'error');
        }
    }
}

// Call management
class CallManager {
    static async startCall() {
        try {
            state.localStream = await MediaHandler.getUserMedia();
            state.peerConnection = await WebRTCHandler.createPeerConnection();

            state.localStream.getTracks().forEach(track => {
                state.peerConnection.addTrack(track, state.localStream);
            });

            this.setupPeerConnectionHandlers();
            await this.createAndSendOffer();
        } catch (error) {
            console.error('Error starting call:', error);
            NotificationManager.show('Failed to start call', 'error');
        }
    }

    static async restartCall() {
        if (state.peerConnection) {
            const offer = await state.peerConnection.createOffer({ iceRestart: true });
            await state.peerConnection.setLocalDescription(offer);
            socket.emit('offer', { offer, room: state.currentRoom });
        }
    }

    static setupPeerConnectionHandlers() {
        state.peerConnection.ontrack = this.handleRemoteTrack.bind(this);
        state.peerConnection.onicecandidate = ({ candidate }) => {
            if (candidate) {
                socket.emit('new-ice-candidate', {
                    candidate,
                    room: state.currentRoom
                });
            }
        };
    }

    static handleRemoteTrack(event) {
        const audio = document.createElement('audio');
        audio.srcObject = event.streams[0];
        audio.autoplay = true;
        
        // Add audio visualizer
        this.addAudioVisualizer(event.streams[0]);
        
        document.body.appendChild(audio);
        state.audioElements.add(audio);

        // Monitor audio levels
        this.monitorAudioLevels(event.streams[0]);
    }

    static addAudioVisualizer(stream) {
        // Implementation of audio visualization
        // This could show when someone is speaking
    }

    static monitorAudioLevels(stream) {
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyzer = audioContext.createAnalyser();
        source.connect(analyzer);

        const dataArray = new Uint8Array(analyzer.frequencyBinCount);
        
        const checkAudioLevel = () => {
            analyzer.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
            
            if (average > 30) { // Threshold for speaking detection
                this.handleSpeakingStateChange(true);
            } else {
                this.handleSpeakingStateChange(false);
            }

            if (state.isCallConnected) {
                requestAnimationFrame(checkAudioLevel);
            }
        };

        checkAudioLevel();
    }

    static handleSpeakingStateChange(isSpeaking) {
        // Update UI to show who is speaking
        ParticipantManager.updateSpeakingState(isSpeaking);
    }

    static async createAndSendOffer() {
        try {
            const offer = await state.peerConnection.createOffer();
            await state.peerConnection.setLocalDescription(offer);
            socket.emit('offer', { offer, room: state.currentRoom });
        } catch (error) {
            console.error('Error creating offer:', error);
            NotificationManager.show('Failed to create call offer', 'error');
        }
    }

    static endCall() {
        if (state.peerConnection) {
            state.peerConnection.close();
        }
        if (state.localStream) {
            state.localStream.getTracks().forEach(track => track.stop());
        }
        state.reset();
        UI.landingPage.style.display = 'block';
        UI.callPage.style.display = 'none';
        socket.emit('leave-call', state.currentRoom);
    }
}

// Participant management
class ParticipantManager {
    static addParticipant(id, username) {
        state.participants.set(id, { username, isMuted: false, isSpeaking: false });
        this.updateParticipantsList();
    }

    static removeParticipant(id) {
        state.participants.delete(id);
        this.updateParticipantsList();
    }

    static updateParticipantsList() {
        const container = document.createElement('div');
        container.className = 'participants-container';

        const header = document.createElement('h3');
        header.className = 'participants-header';
        header.textContent = 'Participants';
        container.appendChild(header);

        const list = document.createElement('div');
        list.className = 'participants-list';

        state.participants.forEach((participant, id) => {
            const participantDiv = document.createElement('div');
            participantDiv.className = 'participant-item';
            if (participant.isSpeaking) participantDiv.classList.add('speaking');

            const usernameSpan = document.createElement('span');
            usernameSpan.className = 'participant-name';
            usernameSpan.textContent = participant.username;

            const statusIcon = document.createElement('i');
            statusIcon.className = `fas ${participant.isMuted ? 'fa-microphone-slash' : 'fa-microphone'}`;
            statusIcon.classList.add(participant.isMuted ? 'muted' : 'unmuted');

            participantDiv.appendChild(usernameSpan);
            participantDiv.appendChild(statusIcon);
            list.appendChild(participantDiv);
        });

        container.appendChild(list);
        UI.participantsList.innerHTML = '';
        UI.participantsList.appendChild(container);
    }

    static updateSpeakingState(isSpeaking) {
        const selfParticipant = state.participants.get('self');
        if (selfParticipant) {
            selfParticipant.isSpeaking = isSpeaking;
            this.updateParticipantsList();
        }
    }
}

// Notification management
class NotificationManager {
    static show(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}

// Event listeners
UI.createRoomBtn.addEventListener('click', () => {
    if (!UI.usernameInput.value.trim()) {
        return NotificationManager.show('Please enter a username', 'error');
    }

    state.currentUsername = UI.usernameInput.value.trim();
    // Use crypto.getRandomValues for better randomness
    const roomCode = Array.from(crypto.getRandomValues(new Uint8Array(CONFIG.ROOM_CODE_LENGTH)))
        .map(byte => byte % 36)
        .map(n => n.toString(36))
        .join('')
        .toUpperCase();

    UI.generatedRoomCode.style.display = 'flex';
    UI.roomCodeText.textContent = roomCode;
    state.currentRoom = roomCode;

    state.participants.set('self', {
        username: state.currentUsername,
        isMuted: false,
        isSpeaking: false
    });
    ParticipantManager.updateParticipantsList();

    socket.emit('create-room', { room: roomCode, username: state.currentUsername });
});

UI.joinRoomBtn.addEventListener('click', async () => {
    if (!UI.usernameInput.value.trim()) {
        return NotificationManager.show('Please enter a username', 'error');
    }

    state.currentUsername = UI.usernameInput.value.trim();
    const roomCode = UI.roomCodeInput.value.trim().toUpperCase();
    
    if (!roomCode) {
        return NotificationManager.show('Please enter a room code', 'error');
    }

    state.currentRoom = roomCode;
    state.participants.set('self', {
        username: state.currentUsername,
        isMuted: false,
        isSpeaking: false
    });
    ParticipantManager.updateParticipantsList();

    socket.emit('join-room', { room: roomCode, username: state.currentUsername });
    UI.landingPage.style.display = 'none';
    UI.callPage.style.display = 'block';
    await CallManager.startCall();
});

UI.muteBtn.addEventListener('click', () => {
    if (!state.localStream) {
        return NotificationManager.show('No active audio stream', 'error');
    }

    const audioTrack = state.localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        state.isMuted = !audioTrack.enabled;

        const selfParticipant = state.participants.get('self');
        selfParticipant.isMuted = state.isMuted;
        state.participants.set('self', selfParticipant);
        ParticipantManager.updateParticipantsList();

        UI.muteBtn.classList.toggle('muted', state.isMuted);
        socket.emit('mute-status', {
            room: state.currentRoom,
            isMuted: state.isMuted
        });

        NotificationManager.show(state.isMuted ? 'Microphone muted' : 'Microphone unmuted', 'info');
    }
});

UI.hangupBtn.addEventListener('click', () => {
    CallManager.endCall();
    NotificationManager.show('Call ended', 'info');
});

UI.copyRoomCodeBtn.addEventListener('click', () => {
    const roomCode = UI.roomCodeText.textContent;
    navigator.clipboard.writeText(roomCode)
        .then(() => NotificationManager.show('Room code copied to clipboard', 'success'))
        .catch(() => NotificationManager.show('Failed to copy room code', 'error'));
});

// Socket event handlers
const socketHandlers = {
    'connect': () => {
        console.log('Connected to signaling server');
        if (state.isReconnecting) {
            NotificationManager.show('Reconnected to server', 'success');
            state.isReconnecting = false;
        }
    },

    'connect_error': (error) => {
        console.error('Connection error:', error);
        NotificationManager.show('Failed to connect to server', 'error');
        state.isReconnecting = true;
    },

    'room-created': ({ room }) => {
        NotificationManager.show('Room created successfully', 'success');
        UI.landingPage.style.display = 'none';
        UI.callPage.style.display = 'block';
        CallManager.startCall();
    },

    'room-joined': ({ room }) => {
        NotificationManager.show('Joined room successfully', 'success');
    },

    'room-full': () => {
        NotificationManager.show(`Room is full (max ${CONFIG.MAX_PARTICIPANTS} participants)`, 'error');
        UI.landingPage.style.display = 'block';
        UI.callPage.style.display = 'none';
    },

    'room-not-found': () => {
        NotificationManager.show('Room not found', 'error');
        UI.landingPage.style.display = 'block';
        UI.callPage.style.display = 'none';
    },

    'user-joined': ({ id, username }) => {
        ParticipantManager.addParticipant(id, username);
        NotificationManager.show(`${username} joined the call`, 'info');
    },

    'user-left': ({ id }) => {
        const participant = state.participants.get(id);
        if (participant) {
            NotificationManager.show(`${participant.username} left the call`, 'info');
            ParticipantManager.removeParticipant(id);
        }
    },

    'offer': async ({ offer, room }) => {
        try {
            if (!state.peerConnection) {
                state.peerConnection = await WebRTCHandler.createPeerConnection();
            }
            await state.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await state.peerConnection.createAnswer();
            await state.peerConnection.setLocalDescription(answer);
            socket.emit('answer', { answer, room });
        } catch (error) {
            console.error('Error handling offer:', error);
            NotificationManager.show('Failed to process call offer', 'error');
        }
    },

    'answer': async ({ answer }) => {
        try {
            if (state.peerConnection) {
                await state.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            }
        } catch (error) {
            console.error('Error handling answer:', error);
            NotificationManager.show('Failed to process call answer', 'error');
        }
    },

    'new-ice-candidate': async ({ candidate }) => {
        try {
            if (state.peerConnection) {
                await state.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            }
        } catch (error) {
            console.error('Error adding ICE candidate:', error);
        }
    },

    'user-mute-status': ({ id, isMuted }) => {
        const participant = state.participants.get(id);
        if (participant) {
            participant.isMuted = isMuted;
            state.participants.set(id, participant);
            ParticipantManager.updateParticipantsList();
        }
    },

    'existing-participants': (participants) => {
        participants.forEach(participant => {
            ParticipantManager.addParticipant(participant.id, participant.username);
        });
    },

    'call-ended': () => {
        NotificationManager.show('Call ended by another participant', 'info');
        CallManager.endCall();
    }
};

// Register all socket handlers
Object.entries(socketHandlers).forEach(([event, handler]) => {
    socket.on(event, handler);
});

// Browser compatibility check
const checkBrowserCompatibility = () => {
    const requirements = {
        webRTC: !!window.RTCPeerConnection,
        getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
        audioContext: !!window.AudioContext || !!window.webkitAudioContext
    };

    const missingFeatures = Object.entries(requirements)
        .filter(([, supported]) => !supported)
        .map(([feature]) => feature);

    if (missingFeatures.length > 0) {
        NotificationManager.show(
            `Your browser doesn't support: ${missingFeatures.join(', ')}. Please use a modern browser.`,
            'error'
        );
        return false;
    }
    return true;
};

// Initialize the application
const initializeApp = () => {
    if (!checkBrowserCompatibility()) return;

    // Add device change listener
    state.deviceChangeListeners.add(async (devices) => {
        await MediaHandler.handleDeviceChange();
    });

    // Handle page visibility changes
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && state.isCallConnected) {
            NotificationManager.show('Call running in background', 'info');
        }
    });

    // Handle beforeunload
    window.addEventListener('beforeunload', (e) => {
        if (state.isCallConnected) {
            e.preventDefault();
            e.returnValue = 'You are currently in a call. Are you sure you want to leave?';
        }
    });

    console.log('Voice call application initialized');
};

// Start the application
initializeApp();