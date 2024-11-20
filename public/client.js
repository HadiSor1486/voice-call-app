const socket = io();

// Landing Page Elements
const landingPage = document.getElementById('landing-page');
const createRoomBtn = document.getElementById('create-room');
const joinRoomBtn = document.getElementById('join-room');
const roomCodeInput = document.getElementById('room-code-input');
const generatedRoomCode = document.getElementById('generated-room-code');
const roomCodeText = document.getElementById('room-code');
const copyBtn = document.getElementById('copy-btn');

// Call Page Elements
const callPage = document.getElementById('call-page');
const muteBtn = document.getElementById('mute-btn');
const hangupBtn = document.getElementById('hangup-btn');
const speakerBtn = document.getElementById('speaker-btn');
const callNotification = document.getElementById('call-notification');

let localStream;
let peerConnection;
let currentRoom;

// Ice server configuration
const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'turn:your-turn-server.com', username: 'username', credential: 'password' }
    ]
};

// Handle room creation
createRoomBtn.addEventListener('click', () => {
    const roomCode = Math.random().toString(36).substring(2, 8);
    generatedRoomCode.style.display = 'block';
    roomCodeText.textContent = roomCode;
    currentRoom = roomCode;
    socket.emit('create-room', roomCode);
});

// Handle copying room code
copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(roomCodeText.textContent).then(() => {
        alert('Room code copied!');
    });
});

// Handle joining a room
joinRoomBtn.addEventListener('click', () => {
    const roomCode = roomCodeInput.value.trim();
    if (!roomCode) return alert('Please enter a room code.');
    currentRoom = roomCode;
    socket.emit('join-room', roomCode);
    showCallPage();
});

// Show call page
function showCallPage() {
    landingPage.style.display = 'none';
    callPage.style.display = 'block';
    startCall();
}

// Handle WebRTC connection
function startCall() {
    navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then((stream) => {
        localStream = stream;
        peerConnection = new RTCPeerConnection(iceServers);

        localStream.getTracks().forEach((track) => {
            peerConnection.addTrack(track, localStream);
        });

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('new-ice-candidate', { candidate: event.candidate, room: currentRoom });
            }
        };

        peerConnection.ontrack = (event) => {
            const audio = document.createElement('audio');
            audio.srcObject = event.streams[0];
            audio.play();
        };

        // Send offer to join
        socket.emit('call', { room: currentRoom });
    }).catch((err) => {
        console.error('Failed to get media: ', err);
    });
}

// Handle mute/unmute button
muteBtn.addEventListener('click', () => {
    const audioTrack = localStream.getTracks().find(track => track.kind === 'audio');
    audioTrack.enabled = !audioTrack.enabled;
    muteBtn.textContent = audioTrack.enabled ? 'Mute' : 'Unmute';
});

// Handle speaker button
speakerBtn.addEventListener('click', () => {
    const audioTracks = peerConnection.getReceivers().map(receiver => receiver.track);
    audioTracks.forEach(track => {
        track.enabled = !track.enabled;
    });
    speakerBtn.textContent = audioTracks.some(track => track.enabled) ? 'Speaker On' : 'Speaker Off';
});

// Handle hangup button
hangupBtn.addEventListener('click', () => {
    socket.emit('hangup', currentRoom);
    hangupCall();
});

// Hang up the call for both users
function hangupCall() {
    localStream.getTracks().forEach(track => track.stop());
    peerConnection.close();
    peerConnection = null;
    landingPage.style.display = 'flex';
    callPage.style.display = 'none';
    currentRoom = null;
}

// Handle notifications
socket.on('call-on', () => {
    callNotification.style.display = 'block';
    setTimeout(() => {
        callNotification.style.display = 'none';
    }, 3000);
});

// Handle peer connection
socket.on('new-ice-candidate', (data) => {
    const candidate = new RTCIceCandidate(data.candidate);
    peerConnection.addIceCandidate(candidate);
});

// Handle room creation and joining
socket.on('room-created', (roomCode) => {
    console.log(`Room created: ${roomCode}`);
});

socket.on('room-joined', () => {
    console.log(`Room joined: ${currentRoom}`);
    showCallPage();
});
