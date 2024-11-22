// Connection and state management
const socket = io();
const STATE = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected'
};

class VoiceConnect {
    constructor() {
        this.state = STATE.DISCONNECTED;
        this.localStream = null;
        this.peerConnection = null;
        this.currentRoom = null;
        this.isCallConnected = false;
        this.notifications = new Map();
        this.reconnectionAttempts = 0;
        this.MAX_RECONNECTION_ATTEMPTS = 3;
        
        // DOM Elements
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

        this.initializeEventListeners();
        this.setupSocketHandlers();
    }

    // Initialize all event listeners
    initializeEventListeners() {
        this.elements.createRoomBtn.addEventListener('click', () => this.handleCreateRoom());
        this.elements.joinRoomBtn.addEventListener('click', () => this.handleJoinRoom());
        this.elements.copyRoomCodeBtn.addEventListener('click', () => this.handleCopyRoomCode());
        this.elements.muteBtn.addEventListener('click', () => this.handleMuteToggle());
        this.elements.speakerBtn.addEventListener('click', () => this.handleSpeakerToggle());
        this.elements.hangupBtn.addEventListener('click', () => this.handleHangup());

        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => this.handleVisibilityChange());

        // Handle before unload
        window.addEventListener('beforeunload', (e) => {
            if (this.isCallConnected) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    }

    // Setup WebRTC peer connection
    async setupPeerConnection() {
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ],
            iceCandidatePoolSize: 10
        };

        this.peerConnection = new RTCPeerConnection(configuration);
        
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ 
                audio: true,
                video: false
            });

            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });

            this.setupPeerConnectionHandlers();
        } catch (error) {
            this.showNotification('Microphone access denied. Please check permissions.', 'error');
            throw new Error('Media access denied');
        }
    }

    // Setup WebRTC event handlers
    setupPeerConnectionHandlers() {
        this.peerConnection.onicecandidate = ({ candidate }) => {
            if (candidate && this.currentRoom) {
                socket.emit('new-ice-candidate', {
                    candidate,
                    room: this.currentRoom
                });
            }
        };

        this.peerConnection.onconnectionstatechange = () => {
            this.handleConnectionStateChange();
        };

        this.peerConnection.ontrack = (event) => {
            const audio = document.createElement('audio');
            audio.srcObject = event.streams[0];
            audio.autoplay = true;
            document.body.appendChild(audio);
        };
    }

    // Socket event handlers
    setupSocketHandlers() {
        socket.on('connect', () => {
            this.state = STATE.CONNECTED;
            this.showNotification('Connected to server', 'success');
        });

        socket.on('disconnect', () => {
            this.state = STATE.DISCONNECTED;
            this.showNotification('Connection lost. Attempting to reconnect...', 'warning');
            this.handleDisconnect();
        });

        socket.on('error', (error) => {
            this.showNotification(error, 'error');
        });

        socket.on('room-timeout', () => {
            this.showNotification('Room timed out due to inactivity', 'warning');
            this.handleHangup();
        });

        socket.on('user-joined', () => this.handleUserJoined());
        socket.on('user-left', () => this.handleUserLeft());
        socket.on('offer', async ({ offer }) => await this.handleOffer(offer));
        socket.on('answer', async ({ answer }) => await this.handleAnswer(answer));
        socket.on('new-ice-candidate', async ({ candidate }) => {
            await this.handleNewIceCandidate(candidate);
        });
    }

    // Room management methods
    async handleCreateRoom() {
        const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        this.elements.generatedRoomCode.style.display = 'flex';
        this.elements.roomCodeText.textContent = roomCode;
        this.currentRoom = roomCode;
        
        try {
            await this.setupPeerConnection();
            socket.emit('create-room', roomCode);
            this.showCallPage();
        } catch (error) {
            this.showNotification('Failed to create room: ' + error.message, 'error');
        }
    }

    async handleJoinRoom() {
        const roomCode = this.elements.roomCodeInput.value.trim().toUpperCase();
        if (!roomCode) {
            this.showNotification('Please enter a room code', 'warning');
            return;
        }

        try {
            await this.setupPeerConnection();
            this.currentRoom = roomCode;
            socket.emit('join-room', roomCode);
            this.showCallPage();
        } catch (error) {
            this.showNotification('Failed to join room: ' + error.message, 'error');
        }
    }

    // UI management methods
    showCallPage() {
        this.elements.landingPage.style.display = 'none';
        this.elements.callPage.style.display = 'block';
    }

    showNotification(message, type = 'info', duration = 5000) {
        const notificationId = Date.now();
        const notification = document.createElement('div');
        notification.id = `notification-${notificationId}`;
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        if (duration > 0) {
            setTimeout(() => notification.remove(), duration);
        }
        
        return notificationId;
    }

    // Call control methods
    handleMuteToggle() {
        if (!this.localStream) return;
        
        const audioTrack = this.localStream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
        
        this.elements.muteBtn.querySelector('i').classList.toggle('fa-microphone-slash');
        this.elements.muteBtn.querySelector('i').classList.toggle('fa-microphone');
        
        if (this.isCallConnected) {
            socket.emit('user-mute', {
                room: this.currentRoom,
                isMuted: !audioTrack.enabled
            });
        }
    }

    handleSpeakerToggle() {
        const audio = document.querySelector('audio');
        if (!audio) return;
        
        audio.muted = !audio.muted;
        this.elements.speakerBtn.querySelector('i').classList.toggle('fa-volume-mute');
        this.elements.speakerBtn.querySelector('i').classList.toggle('fa-volume-up');
        
        if (this.isCallConnected) {
            socket.emit('user-speaker', {
                room: this.currentRoom,
                isSpeakerOff: audio.muted
            });
        }
    }

    async handleHangup() {
        if (this.currentRoom) {
            socket.emit('leave-call', this.currentRoom);
        }
        
        this.cleanup();
        this.elements.landingPage.style.display = 'block';
        this.elements.callPage.style.display = 'none';
    }

    // Cleanup and error handling
    cleanup() {
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        document.querySelectorAll('audio').forEach(audio => audio.remove());
        this.currentRoom = null;
        this.isCallConnected = false;
        this.notifications.clear();
    }

    handleConnectionStateChange() {
        const state = this.peerConnection.connectionState;
        switch (state) {
            case 'failed':
                this.showNotification('Connection failed. Please try again.', 'error');
                this.handleHangup();
                break;
            case 'disconnected':
                this.showNotification('Peer disconnected', 'warning');
                break;
            case 'connected':
                this.showNotification('Connected to peer', 'success');
                break;
        }
    }

    handleVisibilityChange() {
        if (document.hidden && this.isCallConnected) {
            this.showNotification('Call running in background', 'info');
        }
    }
}

// Initialize the application
const app = new VoiceConnect();