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
        this.isMuted = false;
        this.isSpeakerOff = false;
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
            callPageRoomCode: document.getElementById('call-page-room-code'),
            callPageRoomCodeText: document.getElementById('call-page-room-code-text'),
            copyRoomCodeBtn: document.getElementById('copy-room-code'),
            callPageCopyRoomCodeBtn: document.getElementById('call-page-copy-room-code'),
            muteBtn: document.getElementById('mute-btn'),
            hangupBtn: document.getElementById('hangup-btn'),
            speakerBtn: document.getElementById('speaker-btn')
        };

        this.initializeEventListeners();
        this.setupSocketHandlers();
    }

    initializeEventListeners() {
        this.elements.createRoomBtn.addEventListener('click', () => this.handleCreateRoom());
        this.elements.joinRoomBtn.addEventListener('click', () => this.handleJoinRoom());
        this.elements.copyRoomCodeBtn.addEventListener('click', () => this.handleCopyRoomCode());
        this.elements.callPageCopyRoomCodeBtn.addEventListener('click', () => this.handleCopyCallPageRoomCode());
        this.elements.muteBtn.addEventListener('click', () => this.handleMuteToggle());
        this.elements.speakerBtn.addEventListener('click', () => this.handleSpeakerToggle());
        this.elements.hangupBtn.addEventListener('click', () => this.handleHangup());

        document.addEventListener('visibilitychange', () => this.handleVisibilityChange());

        window.addEventListener('beforeunload', (e) => {
            if (this.isCallConnected) {
                e.preventDefault();
                e.returnValue = 'You are currently in a call. Are you sure you want to leave?';
            }
        });
    }

    copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            this.showNotification('Room code copied!', 'success', 2000);
        }).catch(err => {
            this.showNotification('Failed to copy room code', 'error');
        });
    }

    async setupPeerConnection() {
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                {
                    urls: 'turn:openrelay.metered.ca:80',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                }
            ],
            iceCandidatePoolSize: 10
        };

        this.peerConnection = new RTCPeerConnection(configuration);
        
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ 
                audio: { echoCancellation: true, noiseSuppression: true },
                video: false
            });

            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });

            this.setupPeerConnectionHandlers();
        } catch (error) {
            this.showNotification('Microphone access denied. Please check permissions.', 'error');
            throw error;
        }
    }

    setupPeerConnectionHandlers() {
        this.peerConnection.onicecandidate = ({ candidate }) => {
            if (candidate && this.currentRoom) {
                socket.emit('new-ice-candidate', {
                    candidate: candidate.toJSON(),
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
            audio.volume = this.isSpeakerOff ? 0 : 1;
            document.body.appendChild(audio);
        };
    }

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

        socket.on('room-timeout', () => {
            this.showNotification('Room timed out due to inactivity', 'warning');
            this.handleHangup();
        });

        socket.on('offer', async ({ offer }) => await this.handleOffer(offer));
        socket.on('answer', async ({ answer }) => await this.handleAnswer(answer));
        socket.on('new-ice-candidate', async ({ candidate }) => {
            await this.handleNewIceCandidate(candidate);
        });
    }

    async handleCreateRoom() {
        const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        this.elements.generatedRoomCode.style.display = 'flex';
        this.elements.roomCodeText.textContent = roomCode;
        this.elements.callPageRoomCodeText.textContent = roomCode;
        
        this.currentRoom = roomCode;
        
        try {
            await this.setupPeerConnection();
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            
            socket.emit('create-room', { 
                roomCode, 
                offer: this.peerConnection.localDescription 
            });
            
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
            this.elements.callPageRoomCodeText.textContent = roomCode;
            
            socket.emit('join-room', roomCode);
            this.showCallPage();
        } catch (error) {
            this.showNotification('Failed to join room: ' + error.message, 'error');
        }
    }

    async handleOffer(offer) {
        try {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            
            socket.emit('answer', { 
                answer: this.peerConnection.localDescription, 
                room: this.currentRoom 
            });
        } catch (error) {
            this.showNotification('Error handling offer: ' + error.message, 'error');
        }
    }

    async handleAnswer(answer) {
        try {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            this.isCallConnected = true;
        } catch (error) {
            this.showNotification('Error handling answer: ' + error.message, 'error');
        }
    }

    async handleNewIceCandidate(candidate) {
        try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            this.showNotification('Error adding ICE candidate: ' + error.message, 'error');
        }
    }

    handleMuteToggle() {
        if (!this.localStream) return;
        
        const audioTrack = this.localStream.getAudioTracks()[0];
        this.isMuted = !this.isMuted;
        audioTrack.enabled = !this.isMuted;
        
        this.elements.muteBtn.querySelector('i').classList.toggle('fa-microphone-slash');
        this.elements.muteBtn.querySelector('i').classList.toggle('fa-microphone');
        
        if (this.isCallConnected) {
            socket.emit('user-mute', {
                room: this.currentRoom,
                isMuted: this.isMuted
            });
        }
    }

    handleSpeakerToggle() {
        const audio = document.querySelector('audio');
        if (!audio) return;
        
        this.isSpeakerOff = !this.isSpeakerOff;
        audio.volume = this.isSpeakerOff ? 0 : 1;
        
        this.elements.speakerBtn.querySelector('i').classList.toggle('fa-volume-mute');
        this.elements.speakerBtn.querySelector('i').classList.toggle('fa-volume-up');
        
        if (this.isCallConnected) {
            socket.emit('user-speaker', {
                room: this.currentRoom,
                isSpeakerOff: this.isSpeakerOff
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
        this.isMuted = false;
        this.isSpeakerOff = false;
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
                this.isCallConnected = true;
                this.showNotification('Connected to peer', 'success');
                break;
        }
    }

    handleVisibilityChange() {
        if (document.hidden && this.isCallConnected) {
            this.showNotification('Call running in background', 'info');
        }
    }

    // Existing methods like copyToClipboard, showNotification remain the same
    handleCopyRoomCode() {
        this.copyToClipboard(this.elements.roomCodeText.textContent);
    }

    handleCopyCallPageRoomCode() {
        this.copyToClipboard(this.elements.callPageRoomCodeText.textContent);
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

    showCallPage() {
        this.elements.landingPage.style.display = 'none';
        this.elements.callPage.style.display = 'block';
    }

    handleDisconnect() {
        if (this.isCallConnected) {
            this.cleanup();
            this.showCallPage();
        }
    }
}

const app = new VoiceConnect();