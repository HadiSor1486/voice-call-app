// Enhanced WebRTC Client-Side Application Logic

class WebRTCClientApp {
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

        // WebRTC and connection state
        this.socket = null;
        this.localStream = null;
        this.peerConnection = null;
        this.currentRoom = null;
        
        // Call state management
        this.callState = {
            isConnected: false,
            isMuted: false,
            isSpeakerMuted: false
        };

        // Error and notification handling
        this.errorHandler = new ErrorHandler();
        this.notificationManager = new NotificationManager();

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

        // Add connection status monitoring
        this.setupConnectionMonitoring();
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

    initializeSocket() {
        try {
            this.socket = io({
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000
            });

            // Socket event handlers
            this.setupSocketEventHandlers();
        } catch (error) {
            this.errorHandler.handleError('Socket initialization failed', error);
            this.notificationManager.showError('Failed to connect. Please check your network.');
        }
    }

    setupSocketEventHandlers() {
        // Connection events
        this.socket.on('connect', () => {
            this.notificationManager.show('Connected to server');
        });

        this.socket.on('disconnect', () => {
            this.notificationManager.showWarning('Disconnected from server');
            this.resetAppState();
        });

        // Room and call events
        this.socket.on('room-created', (roomCode) => {
            this.onRoomCreated(roomCode);
        });

        this.socket.on('user-joined', () => {
            this.onUserJoined();
        });

        this.socket.on('error', (errorMsg) => {
            this.errorHandler.handleError('Server error', errorMsg);
            this.notificationManager.showError(errorMsg);
        });

        // WebRTC signaling events
        this.setupWebRTCSignalingHandlers();
    }

    setupWebRTCSignalingHandlers() {
        this.socket.on('offer', async (data) => {
            try {
                await this.handleOffer(data.offer);
            } catch (error) {
                this.errorHandler.handleError('Offer handling failed', error);
            }
        });

        this.socket.on('answer', async (data) => {
            try {
                await this.handleAnswer(data.answer);
            } catch (error) {
                this.errorHandler.handleError('Answer handling failed', error);
            }
        });

        this.socket.on('new-ice-candidate', (data) => {
            try {
                this.handleIceCandidate(data.candidate);
            } catch (error) {
                this.errorHandler.handleError('ICE candidate handling failed', error);
            }
        });
    }

    setupConnectionMonitoring() {
        // Monitor and log connection quality
        const checkConnectionQuality = () => {
            if (this.peerConnection) {
                this.peerConnection.getStats().then(stats => {
                    // Basic connection quality logging
                    stats.forEach(report => {
                        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                            console.log('Connection quality:', report);
                        }
                    });
                });
            }
        };

        // Check connection quality every 10 seconds
        setInterval(checkConnectionQuality, 10000);
    }

    createRoom() {
        const roomCode = this.generateRoomCode();
        
        this.elements.generatedRoomCode.style.display = 'flex';
        this.elements.roomCodeText.textContent = roomCode;
        this.currentRoom = roomCode;
        
        this.socket.emit('create-room', roomCode);
        this.notificationManager.show(`Room ${roomCode} created successfully!`);
    }

    generateRoomCode() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    joinRoom() {
        const roomCode = this.elements.roomCodeInput.value.trim().toUpperCase();
        
        if (!roomCode) {
            this.notificationManager.showError('Please enter a room code');
            return;
        }

        this.currentRoom = roomCode;
        this.socket.emit('join-room', roomCode);
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
            this.errorHandler.handleError('Call start failed', error);
            this.notificationManager.showError('Failed to start call. Check microphone permissions.');
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

        // Add connection state tracking
        this.peerConnection.onconnectionstatechange = () => {
            switch(this.peerConnection.connectionState) {
                case 'connected':
                    this.notificationManager.show('Peer connection established');
                    break;
                case 'disconnected':
                case 'failed':
                    this.notificationManager.showWarning('Peer connection lost');
                    this.resetAppState();
                    break;
            }
        };
    }

    // Additional methods like handleOffer, handleAnswer, etc. would be similar to those in client.js
    // ... (rest of the methods from client.js)

    resetAppState() {
        // Reset all application state
        this.currentRoom = null;
        this.localStream = null;
        
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        // Reset UI
        this.elements.landingPage.style.display = 'block';
        this.elements.callPage.style.display = 'none';
    }

    // Error handling utility
    handleError(context, error) {
        console.error(`${context}:`, error);
        this.notificationManager.showError(`Error in ${context}`);
    }
}

// Utility Classes
class ErrorHandler {
    handleError(context, error) {
        console.error(`[ERROR] ${context}:`, error);
    }
}

class NotificationManager {
    show(message, type = 'info') {
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.className = `notification ${type}`;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 5000);
    }

    showError(message) {
        this.show(message, 'error');
    }

    showWarning(message) {
        this.show(message, 'warning');
    }
}

// Initialize the client when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    window.webRTCApp = new WebRTCClientApp();
});