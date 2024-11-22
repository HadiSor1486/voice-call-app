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
        this.remoteStream = null;
        this.currentRoom = null;
        this.isCallConnected = false;
        this.remoteAudioElement = null;
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
            callRoomCodeText: document.getElementById('call-room-code-text'),
            callCopyRoomCodeBtn: document.getElementById('call-copy-room-code'),
            copyRoomCodeBtn: document.getElementById('copy-room-code'),
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
        this.elements.callCopyRoomCodeBtn.addEventListener('click', () => this.handleCopyRoomCode());
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

    async setupPeerConnection() {
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                // Consider adding TURN servers for better connectivity
            ],
            iceCandidatePoolSize: 10
        };

        this.peerConnection = new RTCPeerConnection(configuration);
        this.remoteStream = new MediaStream();

        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ 
                audio: { 
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true 
                },
                video: false
            });

            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });

            this.peerConnection.ontrack = (event) => {
                event.streams[0].getTracks().forEach(track => {
                    this.remoteStream.addTrack(track);
                });

                if (!this.remoteAudioElement) {
                    this.remoteAudioElement = document.createElement('audio');
                    this.remoteAudioElement.srcObject = this.remoteStream;
                    this.remoteAudioElement.autoplay = true;
                    this.remoteAudioElement.playsinline = true;
                    document.body.appendChild(this.remoteAudioElement);
                }
            };

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
            const state = this.peerConnection.connectionState;
            console.log(`Connection state: ${state}`);
            
            if (state === 'connected') {
                this.isCallConnected = true;
                this.showNotification('Call connected', 'success');
            } else if (state === 'disconnected' || state === 'failed') {
                this.isCallConnected = false;
                this.showNotification('Call disconnected', 'warning');
                this.handleDisconnect();
            }
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

        socket.on('offer', async ({ offer }) => {
            try {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
                const answer = await this.peerConnection.createAnswer();
                await this.peerConnection.setLocalDescription(answer);
                
                socket.emit('answer', { 
                    answer, 
                    room: this.currentRoom 
                });
            } catch (error) {
                console.error("Error handling offer:", error);
                this.showNotification('Error processing call offer', 'error');
            }
        });

        socket.on('answer', async ({ answer }) => {
            try {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            } catch (error) {
                console.error("Error handling answer:", error);
                this.showNotification('Error processing call answer', 'error');
            }
        });

        socket.on('new-ice-candidate', async ({ candidate }) => {
            try {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
                console.error("Error adding ICE candidate:", error);
            }
        });

        socket.on('user-joined', () => {
            this.createAndSendOffer();
        });
    }

    async createAndSendOffer() {
        try {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            
            socket.emit('offer', {
                offer,
                room: this.currentRoom
            });
        } catch (error) {
            console.error('Error creating offer:', error);
            this.showNotification('Failed to create call offer', 'error');
        }
    }

    async handleCreateRoom() {
        const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        this.currentRoom = roomCode;
        
        try {
            await this.setupPeerConnection();
            socket.emit('create-room', roomCode);
            
            this.elements.generatedRoomCode.style.display = 'flex';
            this.elements.roomCodeText.textContent = roomCode;
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

        this.currentRoom = roomCode;

        try {
            await this.setupPeerConnection();
            socket.emit('join-room', roomCode);
            this.showCallPage();
        } catch (error) {
            this.showNotification('Failed to join room: ' + error.message, 'error');
        }
    }

    handleMuteToggle() {
        if (!this.localStream) return;
        
        const audioTracks = this.localStream.getAudioTracks();
        if (audioTracks.length > 0) {
            const isCurrentlyMuted = !audioTracks[0].enabled;
            audioTracks.forEach(track => track.enabled = isCurrentlyMuted);
            
            this.elements.muteBtn.querySelector('i').classList.toggle('fa-microphone-slash');
            this.elements.muteBtn.querySelector('i').classList.toggle('fa-microphone');
            
            if (this.isCallConnected) {
                socket.emit('user-mute', {
                    room: this.currentRoom,
                    isMuted: !isCurrentlyMuted
                });
            }
        }
    }

    handleSpeakerToggle() {
        if (!this.remoteAudioElement) return;
        
        this.remoteAudioElement.muted = !this.remoteAudioElement.muted;
        this.elements.speakerBtn.querySelector('i').classList.toggle('fa-volume-mute');
        this.elements.speakerBtn.querySelector('i').classList.toggle('fa-volume-up');
        
        if (this.isCallConnected) {
            socket.emit('user-speaker', {
                room: this.currentRoom,
                isSpeakerOff: this.remoteAudioElement.muted
            });
        }
    }

    handleHangup() {
        if (this.currentRoom) {
            socket.emit('leave-call', this.currentRoom);
        }
        
        this.cleanup();
        this.showLandingPage();
    }

    async handleCopyRoomCode() {
        try {
            await navigator.clipboard.writeText(this.elements.roomCodeText.textContent);
            this.elements.callCopyRoomCodeBtn.innerHTML = '<i class="fas fa-check"></i>';
            setTimeout(() => {
                this.elements.callCopyRoomCodeBtn.innerHTML = '<i class="fas fa-copy"></i>';
            }, 2000);
        } catch (error) {
            this.showNotification('Failed to copy room code', 'error');
        }
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
        
        if (this.remoteStream) {
            this.remoteStream.getTracks().forEach(track => track.stop());
            this.remoteStream = null;
        }
        
        if (this.remoteAudioElement) {
            this.remoteAudioElement.srcObject = null;
            this.remoteAudioElement.remove();
            this.remoteAudioElement = null;
        }
        
        this.currentRoom = null;
        this.isCallConnected = false;
    }

    showLandingPage() {
        this.elements.landingPage.style.display = 'block';
        this.elements.callPage.style.display = 'none';
    }

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

    handleVisibilityChange() {
        if (document.hidden && this.isCallConnected) {
            this.showNotification('Call running in background', 'info');
        }
    }

    handleDisconnect() {
        this.reconnectionAttempts++;
        if (this.reconnectionAttempts < this.MAX_RECONNECTION_ATTEMPTS) {
            console.log(`Reconnection attempt ${this.reconnectionAttempts}`);
            // Additional reconnection logic can be added here
        } else {
            this.showNotification('Unable to reconnect. Please check your connection.', 'error');
        }
    }
}

// Initialize the application
const voiceConnect = new VoiceConnect();