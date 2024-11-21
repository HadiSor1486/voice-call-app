const socket = io();

const landingPage = document.getElementById('landing-page');
const callPage = document.getElementById('call-page');
const createRoomBtn = document.getElementById('create-room');
const joinRoomBtn = document.getElementById('join-room');
const roomCodeInput = document.getElementById('room-code-input');
const generatedRoomCode = document.getElementById('generated-room-code');
const roomCodeText = document.getElementById('room-code-text');
const copyRoomCodeBtn = document.getElementById('copy-room-code');

const muteBtn = document.getElementById('mute-btn');
const hangupBtn = document.getElementById('hangup-btn');
const speakerBtn = document.getElementById('speaker-btn');

let localStream;
let peerConnection;
let currentRoom;

const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

// Add "By Sor" text
const callOverlay = document.querySelector('.call-overlay');
const bysorText = document.createElement('div');
bysorText.textContent = 'By Sor';
bysorText.style.color = '#f5f5f5';
bysorText.style.position = 'absolute';
bysorText.style.top = '10px';
bysorText.style.left = '50%';
bysorText.style.transform = 'translateX(-50%)';
bysorText.style.fontSize = '18px';
bysorText.style.fontWeight = 'bold';
callOverlay.appendChild(bysorText);

function showCallNotification(message) {
    const notificationEl = document.createElement('div');
    notificationEl.id = 'call-notification';
    notificationEl.textContent = message;
    document.body.appendChild(notificationEl);
    
    void notificationEl.offsetWidth;
    
    notificationEl.classList.add('show');
    
    setTimeout(() => {
        notificationEl.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(notificationEl);
        }, 500);
    }, 5000);
}

createRoomBtn.addEventListener('click', () => {
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    generatedRoomCode.style.display = 'flex';
    roomCodeText.textContent = roomCode;
    currentRoom = roomCode;
    socket.emit('create-room', roomCode);
});

copyRoomCodeBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(roomCodeText.textContent).then(() => {
        copyRoomCodeBtn.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => {
            copyRoomCodeBtn.innerHTML = '<i class="fas fa-copy"></i>';
        }, 2000);
    });
});

joinRoomBtn.addEventListener('click', () => {
    const roomCode = roomCodeInput.value.trim().toUpperCase();
    if (!roomCode) return alert('Please enter a room code.');
    currentRoom = roomCode;
    socket.emit('join-room', roomCode);
    showCallPage();
});

function showCallPage() {
    landingPage.style.display = 'none';
    callPage.style.display = 'block';
    startCall();
}

function startCall() {
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then((stream) => {
            localStream = stream;
            peerConnection = new RTCPeerConnection(iceServers);

            localStream.getTracks().forEach((track) => {
                peerConnection.addTrack(track, localStream);
            });

            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('new-ice-candidate', {
                        candidate: event.candidate,
                        room: currentRoom
                    });
                }
            };

            peerConnection.ontrack = (event) => {
                const audio = document.createElement('audio');
                audio.srcObject = event.streams[0];
                audio.autoplay = true;
                document.body.appendChild(audio);
            };

            setupCallEventHandlers();
            createAndSendOffer();
        })
        .catch((error) => {
            console.error('Error accessing media devices:', error);
            alert('Unable to access microphone. Please check permissions.');
        });
}

function setupCallEventHandlers() {
    socket.on('user-joined', () => {
        showCallNotification('Call connected! You can now talk.');
    });

    socket.on('offer', async ({ offer }) => {
        showCallNotification('Incoming call request...');
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', { answer, room: currentRoom });
    });

    socket.on('answer', async ({ answer }) => {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on('new-ice-candidate', ({ candidate }) => {
        peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    });

    // New handler for call termination
    socket.on('call-ended', () => {
        showCallNotification('Call has been terminated.');
        terminateCall();
    });
}

function createAndSendOffer() {
    peerConnection.createOffer()
        .then((offer) => {
            peerConnection.setLocalDescription(offer);
            socket.emit('offer', { offer, room: currentRoom });
        });
}

muteBtn.addEventListener('click', () => {
    const audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    muteBtn.querySelector('i').classList.toggle('fa-microphone-slash');
    muteBtn.querySelector('i').classList.toggle('fa-microphone');
});

speakerBtn.addEventListener('click', () => {
    const audio = document.querySelector('audio');
    if (audio) {
        audio.muted = !audio.muted;
        speakerBtn.querySelector('i').classList.toggle('fa-volume-mute');
        speakerBtn.querySelector('i').classList.toggle('fa-volume-up');
    }
});

hangupBtn.addEventListener('click', () => {
    // Notify server that user is leaving the call
    if (currentRoom) {
        socket.emit('leave-call', currentRoom);
    }
    terminateCall();
});

function terminateCall() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    // Remove any audio elements
    const audioElements = document.querySelectorAll('audio');
    audioElements.forEach(audio => audio.remove());

    // Reset to landing page
    landingPage.style.display = 'block';
    callPage.style.display = 'none';
    currentRoom = null;
}