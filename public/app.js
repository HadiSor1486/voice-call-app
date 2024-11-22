class VoiceCallApp {
    constructor() {
        this.socket = io();
        this.state = {
            isConnected: false,
            isMuted: false,
            isSpeakerOff: false,
            inCall: false
        };
        
        // WebRTC Configuration
        this.peerConnection = null;
        this.localStream = null;
        this.currentRoom = null;
        
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

        // ICE Server Configuration
        this.iceConfiguration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ],
            iceCandidatePoolSize: 10
        };

        this.initializeEventListeners();
        this.setupSocketHandlers();
    }

    // Initialize Event Listeners
    initializeEventListeners() {
        this.elements.createRoomBtn.addEventListener('click', () => this.handleCreateRoom());
        this.elements.joinRoomBtn.addEventListener('click', () => this.handleJoinRoom());
        this.elements.copyRoomCodeBtn.addEventListener('click', () => this.handleCopyRoomCode());
        this.elements.muteBtn.addEventListener('click', () => this.handleMuteToggle());
        this.elements.speakerBtn.addEventListener('click', () => this.handleSpeakerToggle());
        this.elements.hangupBtn.addEventListener('click', () => this.handleHangup());

        // Handle page visibility
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.state.inCall) {
                this.showNotification('Call running in background', 'info');
            }
        });

        // Prevent accidental navigation during call
        window.addEventListener('beforeunload', (e) => {
            if (this.state.inCall) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    }

    // Socket Event Handlers
    setupSocketHandlers() {
        this.socket.on('connect', () => {
            this.state.isConnected = true;
            this.showNotification('Connected to server', 'success');
        });

        this.socket.on('disconnect', () => {
            this.state.isConnected = false;
            this.showNotification('Connection lost. Attempting to reconnect...', 'warning');
            this.handleDisconnect();
        });

        this.socket.on('error', (error) => this.showNotification(error, 'error'));
        this.socket.on('room-timeout', () => {
            this.showNotification('Room timed out due to inactivity', 'warning');
            this.handleHangup();
        });

        this.socket.on('offer', async ({ offer }) => await this.handleOffer(offer));
        this.socket.on('answer', async ({ answer }) => await this.handleAnswer(answer));
        this.socket.on('new-ice-candidate', async ({ candidate }) => {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        });

        this.socket.on('user-joined', () => this.showNotification('Another user joined the call', 'info'));
        this.socket.on('user-left', () => this.showNotification('User left the call', 'info'));
    }

    // Room Management
    async handleCreateRoom() {
        const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        this.elements.generatedRoomCode.style.display = 'flex';
        this.elements.roomCodeText.textContent = roomCode;
        this.currentRoom = roomCode;

        try {
            await this.setupMediaStream();
            await this.setupPeerConnection();
            this.socket.emit('create-room', roomCode);
            this.showCallPage();
            this.state.inCall = true;
        } catch (error) {
            this.showNotification(`Failed to create room: ${error.message}`, 'error');
        }
    }

    async handleJoinRoom() {
        const roomCode = this.elements.roomCodeInput.value.trim().toUpperCase();
        if (!roomCode) {
            return this.showNotification('Please enter a room code', 'warning');
        }

        try {
            await this.setupMediaStream();
            await this.setupPeerConnection();
            this.currentRoom = roomCode;
            this.socket.emit('join-room', roomCode);
            this.showCallPage();
            this.state.inCall = true;
        } catch (error) {
            this.showNotification(`Failed to join room: ${error.message}`, 'error');
        }
    }

    // WebRTC Setup
    async setupMediaStream() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false
            });
        } catch (error) {
            throw new Error('Microphone access denied. Please check permissions.');
        }
    }

    async setupPeerConnection() {
        this.peerConnection = new RTCPeerConnection(this.iceConfiguration);

        this.localStream.getTracks().forEach(track => {
            this.peerConnection.addTrack(track, this.localStream);
        });

        this.peerConnection.onicecandidate = ({ candidate }) => {
            if (candidate && this.currentRoom) {
                this.socket.emit('new-ice-candidate', {
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

    // UI Management
    showCallPage() {
        this.elements.landingPage.style.display = 'none';
        this.elements.callPage.style.display = 'block';
    }

    async handleCopyRoomCode() {
        try {
            await navigator.clipboard.writeText(this.elements.roomCodeText.textContent);
            this.elements.copyRoomCodeBtn.innerHTML = '<i class="fas fa-check"></i>';
            setTimeout(() => {
                this.elements.copyRoomCodeBtn.innerHTML = '<i class="fas fa-copy"></i>';
            }, 2000);
        } catch (error) {
            this.showNotification('Failed to copy room code', 'error');
        }
    }

    showNotification(message, type = 'info', duration = 5000) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        if (duration > 0) {
            setTimeout(() => notification.remove(), duration);
        }
    }

    // Call Controls
    handleMuteToggle() {
        if (!this.localStream) return;
        
        const audioTrack = this.localStream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
        this.state.isMuted = !audioTrack.enabled;
        
        const icon = this.elements.muteBtn.querySelector('i');
        icon.classList.toggle('fa-microphone-slash');
        icon.classList.toggle('fa-microphone');
        
        if (this.state.inCall) {
            this.socket.emit('user-mute', {
                room: this.currentRoom,
                isMuted: this.state.isMuted
            });
        }
    }

    handleSpeakerToggle() {
        const audio = document.querySelector('audio');
        if (!audio) return;
        
        this.state.isSpeakerOff = !this.state.isSpeakerOff;
        audio.muted = this.state.isSpeakerOff;
        
        const icon = this.elements.speakerBtn.querySelector('i');
        icon.classList.toggle('fa-volume-mute');
        icon.classList.toggle('fa-volume-up');
        
        if (this.state.inCall) {
            this.socket.emit('user-speaker', {
                room: this.currentRoom,
                isSpeakerOff: this.state.isSpeakerOff
            });
        }
    }

    async handleHangup() {
        if (this.currentRoom) {
            this.socket.emit('leave-call', this.currentRoom);
        }
        
        this.cleanup();
        this.showLandingPage();
    }

    // Connection State Management
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

    handleDisconnect() {
        if (this.state.inCall) {
            this.cleanup();
            this.showLandingPage();
        }
    }

    // Cleanup
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
        this.state.inCall = false;
        this.state.isMuted = false;
        this.state.isSpeakerOff = false;
    }

    showLandingPage() {
        this.elements.landingPage.style.display = 'block';
        this.elements.callPage.style.display = 'none';
    }
}

// Initialize the application
const voiceCallApp = new VoiceCallApp();