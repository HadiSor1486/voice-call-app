const socket = io();

// Landing Page Elements
const landingPage = document.getElementById('landing-page');
const createRoomBtn = document.getElementById('create-room');
const joinRoomBtn = document.getElementById('join-room');
const roomCodeInput = document.getElementById('room-code-input');
const generatedRoomCode = document.getElementById('generated-room-code');
const copyRoomCodeBtn = document.getElementById('copy-room-code');

// Call Page Elements
const callPage = document.getElementById('call-page');
const muteButton = document.getElementById('mute-btn');
const hangupButton = document.getElementById('hangup-btn');
const speakerButton = document.getElementById('speaker-btn');
const callNotification = document.getElementById('call-notification');

let localStream = null;
let peerConnection = null;
let currentRoom = null;
let remoteAudioElement = null;

// WebRTC Configuration with multiple STUN servers
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Utility Functions
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Event Listeners
copyRoomCodeBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(currentRoom).then(() => {
        alert('Room code copied!');
    });
});

createRoomBtn.addEventListener('click', () => {
    const roomCode = generateRoomCode();
    generatedRoomCode.textContent = `Room Code: ${roomCode}`;
    generatedRoomCode.style.display = 'block';
    copyRoomCodeBtn.style.display = 'inline-block';
    currentRoom = roomCode;
    socket.emit('create-room', roomCode);
});

joinRoomBtn.addEventListener('click', () => {
    const roomCode = roomCodeInput.value.trim().toUpperCase();
    if (!roomCode) return alert('Please enter a room code.');
    currentRoom = roomCode;
    socket.emit('join-room', roomCode);
});

// Socket Event Handlers
socket.on('room-created', () => showCallPage());
socket.on('room-error', (message) => alert(message));
socket.on('user-joined', () => updateCallNotification('Peer Joined'));

function showCallPage() {
    landingPage.style.display = 'none';
    callPage.style.display = 'block';
    startCall();
}

async function startCall() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setupPeerConnection();
        createAndSendOffer();
    } catch (error) {
        console.error('Call start error:', error);
        alert('Could not start call. Check microphone permissions.');
    }
}

function setupPeerConnection() {
    peerConnection = new RTCPeerConnection(configuration);

    localStream.getTracks().forEach(track => 
        peerConnection.addTrack(track, localStream)
    );

    peerConnection.onicecandidate = handleICECandidate;
    peerConnection.ontrack = handleRemoteTrack;
}

function handleICECandidate(event) {
    if (event.candidate) {
        socket.emit('new-ice-candidate', {
            candidate: event.candidate,
            room: currentRoom
        });
    }
}

function handleRemoteTrack(event) {
    remoteAudioElement = document.createElement('audio');
    remoteAudioElement.srcObject = event.streams[0];
    remoteAudioElement.autoplay = true;
    updateCallNotification('Call Connected');
}

async function createAndSendOffer() {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', { offer, room: currentRoom });
}

// WebRTC Signaling
socket.on('offer', async (data) => {
    if (!peerConnection) setupPeerConnection();
    
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', { answer, room: currentRoom });
});

socket.on('answer', async (data) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
});

socket.on('new-ice-candidate', async (data) => {
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (error) {
        console.error('ICE candidate error:', error);
    }
});

// Call Control Buttons
muteButton.addEventListener('click', toggleMute);
speakerButton.addEventListener('click', toggleSpeaker);
hangupButton.addEventListener('click', endCall);

function toggleMute() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
        muteButton.querySelector('i').classList.toggle('fa-microphone-slash');
        muteButton.querySelector('i').classList.toggle('fa-microphone');
    }
}

function toggleSpeaker() {
    if (remoteAudioElement) {
        remoteAudioElement.muted = !remoteAudioElement.muted;
        speakerButton.querySelector('i').classList.toggle('fa-volume-mute');
        speakerButton.querySelector('i').classList.toggle('fa-volume-up');
    }
}

function updateCallNotification(message) {
    callNotification.textContent = message;
    callNotification.style.display = 'block';
    setTimeout(() => {
        callNotification.style.display = 'none';
    }, 3000);
}

function endCall() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    socket.emit('hangup', currentRoom);
    location.reload();
}

// Peer Events
socket.on('peer-hangup', endCall);
socket.on('peer-left', () => {
    alert('Peer left the call');
    endCall();
});