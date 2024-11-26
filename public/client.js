import { io } from 'socket.io-client';

class WebRTCClient {
    constructor() {
        // Configuration and state management
        this.config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { 
                    urls: 'turn:turn.example.com',
                    username: 'username',
                    credential: 'password'
                }
            ],
            mediaConstraints: {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            }
        };

        // DOM Elements
        this.initializeDOMElements();

        // Socket and WebRTC state
        this.socket = null;
        this.localStream = null;
        this.peerConnection = null;
        this.currentRoom = null;
        this.callState = {
            isConnected: false,
            isMuted: false,
            isSpeakerMuted: false
        };

        // Notifications
        this.notifications = {
            mute: null,
            speaker: null
        };

        // Client ID for socket authentication
        this.clientId = this.generateClientId();

        // Initialize the application
        this.init();
    }

    initializeDOMElements() {
        this.elements = {
            landingPage: document.getElementById('landing-page'),
            callPage: document.getElementById('call-page'),
            createRoomBtn: document.getElementById('create-room'),
            joinRoomBtn: document.getElementById('join-room'),
            roomCodeInput: document.getElementById('room-code-input'),
            generatedRoomCode: document.getElementById('generated-room-code'),
            roomCodeText: document.getElementById('room-code-text'),
            copyRoomCodeBtn: document.getElementById('copy-room-code'),
            muteBtn: document.getElementById('mute-btn'),
            hangupBtn: document.getElementById('hangup-btn'),
            speakerBtn: document.getElementById('speaker-btn')
        };
    }

    init() {
        // Add event listeners
        this.addEventListeners();

        // Initialize socket connection
        this.initializeSocket();

        // Add "By Hadi" overlay
        this.addByHadiOverlay();
    }

    addByHadiOverlay() {
        const callOverlay = document.querySelector('.call-overlay');
        const bysorText = document.createElement('div');
        bysorText.textContent = 'By Hadi';
        bysorText.style.cssText = `
            color: #f5f5f5;
            position: absolute;
            top: 10px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 18px;
            font-weight: bold;
        `;
        callOverlay.appendChild(bysorText);
    }

    generateClientId() {
        return `client-${Math.random().toString(36).substr(2, 9)}`;
    }

    initializeSocket() {
        this.socket = io({
            query: { clientId: this.clientId },
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });

        // Socket event handlers
        this.setupSocketEventHandlers();
    }

    addEventListeners() {
        // Room creation and joining
        this.elements.createRoomBtn.addEventListener('click', () => this.createRoom());
        this.elements.joinRoomBtn.addEventListener('click', () => this.joinRoom());
        this.elements.copyRoomCodeBtn.addEventListener('click', () => this.copyRoomCode());

        // Call controls
        this.elements.muteBtn.addEventListener('click', () => this.toggleMute());
        this.elements.speakerBtn.addEventListener('click', () => this.toggleSpeaker());
        this.elements.hangupBtn.addEventListener('click', () => this.endCall());
    }

    createRoom() {
        const roomCode = this.generateRoomCode();
        this.elements.generatedRoomCode.style.display = 'flex';
        this.elements.roomCodeText.textContent = roomCode;
        this.currentRoom = roomCode;
        
        this.socket.emit('create-room', roomCode);
        this.showCallNotification(`Room ${roomCode} created successfully!`);
    }

    generateRoomCode() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    copyRoomCode() {
        const roomCode = this.elements.roomCodeText.textContent;
        navigator.clipboard.writeText(roomCode).then(() => {
            this.animateCopyButton();
        }).catch(err => {
            console.error('Failed to copy room code', err);
            this.showCallNotification('Failed to copy room code', true);
        });
    }

    animateCopyButton() {
        const btn = this.elements.copyRoomCodeBtn;
        btn.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => {
            btn.innerHTML = '<i class="fas fa-copy"></i>';
        }, 2000);
    }

    joinRoom() {
        const roomCode = this.elements.roomCodeInput.value.trim().toUpperCase();
        if (!roomCode) {
            this.showCallNotification('Please enter a room code', true);
            return;
        }

        this.currentRoom = roomCode;
        this.socket.emit('join-room', roomCode);
    }

    setupSocketEventHandlers() {
        // Room events
        this.socket.on('room-created', () => {
            this.showCallPage();
        });

        this.socket.on('user-joined', () => {
            this.handleUserJoined();
        });

        this.socket.on('error', (errorMsg) => {
            this.showCallNotification(errorMsg, true);
        });

        // WebRTC signaling events
        this.socket.on('offer', async (data) => {
            await this.handleOffer(data.offer);
        });

        this.socket.on('answer', async (data) => {
            await this.handleAnswer(data.answer);
        });

        this.socket.on('new-ice-candidate', (data) => {
            this.handleIceCandidate(data.candidate);
        });

        // Mute and speaker events
        this.socket.on('other-user-mute', (data) => {
            this.handleRemoteMute(data.isMuted);
        });

        this.socket.on('other-user-speaker', (data) => {
            this.handleRemoteSpeaker(data.isSpeakerOff);
        });

        // Disconnection handling
        this.socket.on('disconnect', () => {
            this.showCallNotification('Connection lost. Reconnecting...', true);
        });

        this.socket.on('reconnect', () => {
            this.showCallNotification('Reconnected successfully!');
        });
    }

    async startCall() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia(
                this.config.mediaConstraints
            );

            this.createPeerConnection();
            this.addLocalStreamToPeerConnection();
            await this.createAndSendOffer();
        } catch (error) {
            console.error('Call start error:', error);
            this.showCallNotification('Failed to start call. Check microphone permissions.', true);
        }
    }

    createPeerConnection() {
        this.peerConnection = new RTCPeerConnection(this.config.iceServers);

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('new-ice-candidate', {
                    candidate: event.candidate,
                    room: this.currentRoom
                });
            }
        };

        this.peerConnection.ontrack = (event) => {
            this.handleRemoteStream(event);
        };
    }

    addLocalStreamToPeerConnection() {
        this.localStream.getTracks().forEach((track) => {
            this.peerConnection.addTrack(track, this.localStream);
        });
    }

    async createAndSendOffer() {
        try {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            this.socket.emit('offer', { 
                offer, 
                room: this.currentRoom 
            });
        } catch (error) {
            console.error('Offer creation error:', error);
        }
    }

    async handleOffer(offer) {
        try {
            await this.peerConnection.setRemoteDescription(
                new RTCSessionDescription(offer)
            );
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            this.socket.emit('answer', { 
                answer, 
                room: this.currentRoom 
            });
        } catch (error) {
            console.error('Handle offer error:', error);
        }
    }

    async handleAnswer(answer) {
        try {
            await this.peerConnection.setRemoteDescription(
                new RTCSessionDescription(answer)
            );
        } catch (error) {
            console.error('Handle answer error:', error);
        }
    }

    handleIceCandidate(candidate) {
        try {
            this.peerConnection.addIceCandidate(
                new RTCIceCandidate(candidate)
            );
        } catch (error) {
            console.error('ICE candidate error:', error);
        }
    }

    handleRemoteStream(event) {
        const remoteAudio = document.createElement('audio');
        remoteAudio.srcObject = event.streams[0];
        remoteAudio.autoplay = true;
        document.body.appendChild(remoteAudio);
    }

    handleUserJoined() {
        this.callState.isConnected = true;
        this.showCallNotification('Call connected! You can now talk.');
        this.syncInitialCallState();
    }

    syncInitialCallState() {
        const audioTrack = this.localStream.getAudioTracks()[0];
        this.socket.emit('user-mute', { 
            room: this.currentRoom, 
            isMuted: !audioTrack.enabled 
        });

        const audio = document.querySelector('audio');
        if (audio) {
            this.socket.emit('user-speaker', { 
                room: this.currentRoom, 
                isSpeakerOff: audio.muted 
            });
        }
    }

    toggleMute() {
        if (!this.localStream) return;

        const audioTrack = this.localStream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
        this.updateMuteButtonUI();
        
        if (this.callState.isConnected) {
            this.socket.emit('user-mute', { 
                room: this.currentRoom, 
                isMuted: !audioTrack.enabled 
            });
        }
    }

    updateMuteButtonUI() {
        const icon = this.elements.muteBtn.querySelector('i');
        icon.classList.toggle('fa-microphone-slash');
        icon.classList.toggle('fa-microphone');
    }

    toggleSpeaker() {
        const audio = document.querySelector('audio');
        if (!audio) return;

        audio.muted = !audio.muted;
        this.updateSpeakerButtonUI();
        
        if (this.callState.isConnected) {
            this.socket.emit('user-speaker', { 
                room: this.currentRoom, 
                isSpeakerOff: audio.muted 
            });
        }
    }

    updateSpeakerButtonUI() {
        const icon = this.elements.speakerBtn.querySelector('i');
        icon.classList.toggle('fa-volume-mute');
        icon.classList.toggle('fa-volume-up');
    }

    handleRemoteMute(isMuted) {
        this.clearNotification('mute');
        
        if (isMuted) {
            this.notifications.mute = this.showCallNotification(
                'Your friend is muted', 
                true
            );
        }
    }

    handleRemoteSpeaker(isSpeakerOff) {
        this.clearNotification('speaker');
        
        if (isSpeakerOff) {
            this.notifications.speaker = this.showCallNotification(
                'Your friend turned off speaker', 
                true
            );
        }
    }

    clearNotification(type) {
        if (this.notifications[type]) {
            this.notifications[type].remove();
            this.notifications[type] = null;
        }
    }

    showCallPage() {
        this.elements.landingPage.style.display = 'none';
        this.elements.callPage.style.display = 'block';
        this.startCall();
    }

    endCall() {
        if (this.currentRoom) {
            this.socket.emit('leave-call', this.currentRoom);
        }
        this.terminateCall();
    }

    terminateCall() {
        // Close peer connection
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        // Stop local stream
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        // Remove audio elements
        document.querySelectorAll('audio').forEach(audio => audio.remove());

        // Clear notifications
        Object.keys(this.notifications).forEach(key => {
            if (this.notifications[key]) {
                this.notifications[key].remove();
                this.notifications[key] = null;
            }
        });

        // Reset UI and state
        this.elements.landingPage.style.display = 'block';
        this.elements.callPage.style.display = 'none';
        
        this.currentRoom = null;
        this.callState = {
            isConnected: false,
            isMuted: false,
            isSpeakerMuted: false
        };
    }

    showCallNotification(message, persistent = false) {
        // Remove existing notification
        const existingNotification = document.getElementById('call-notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        const notificationEl = document.createElement('div');
        notificationEl.id = 'call-notification';
        notificationEl.textContent = message;
        document.body.appendChild(notificationEl);
        
        // Force reflow for animation
        void notificationEl.offsetWidth;
        
        notificationEl.classList.add('show');
        
        if (!persistent) {
            setTimeout(() => {
                notificationEl.classList.remove('show');
                setTimeout(() => {
                    document.body.removeChild(notificationEl);
                }, 500);
            }, 5000);
        }
        
        return notificationEl;
    }
}

// Initialize the client when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    window.webRTCClient = new WebRTCClient();
});