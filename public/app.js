const socket = io();
const muteButton = document.getElementById('mute-btn');
const hangupButton = document.getElementById('hangup-btn');
const speakerButton = document.getElementById('speaker-btn');
const callNotification = document.getElementById('call-notification');
const createRoomButton = document.getElementById('create-room');
const joinRoomButton = document.getElementById('join-room');
const roomCodeInput = document.getElementById('room-code-input');
const generatedRoomCode = document.getElementById('generated-room-code');
const roomCodeDisplay = document.getElementById('room-code');
const copyBtn = document.getElementById('copy-btn');

let localStream = null;
let peerConnection = null;
let isMuted = false;
let isSpeakerMuted = false;
let roomCode = "";

// Socket.IO client for signaling
const configuration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// Start the call
async function startCall() {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    peerConnection = new RTCPeerConnection(configuration);
    localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('new-ice-candidate', event.candidate);
        }
    };

    peerConnection.ontrack = (event) => {
        const [remoteStream] = event.streams;
        const audioElement = new Audio();
        audioElement.srcObject = remoteStream;
        audioElement.autoplay = true;
        audioElement.muted = isSpeakerMuted;
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', offer);
}

// Mute/unmute the microphone
muteButton.addEventListener('click', () => {
    if (localStream) {
        isMuted = !isMuted;
        localStream.getAudioTracks()[0].enabled = !isMuted;
        muteButton.querySelector('i').classList.toggle('fa-microphone-slash', isMuted);
        muteButton.querySelector('i').classList.toggle('fa-microphone', !isMuted);
        muteButton.style.color = isMuted ? 'red' : 'green';
    }
});

// Toggle speaker on/off
speakerButton.addEventListener('click', () => {
    isSpeakerMuted = !isSpeakerMuted;
    speakerButton.querySelector('i').classList.toggle('fa-volume-up', !isSpeakerMuted);
    speakerButton.querySelector('i').classList.toggle('fa-volume-mute', isSpeakerMuted);
    speakerButton.style.color = isSpeakerMuted ? 'red' : 'green';
});

// Hang up the call
hangupButton.addEventListener('click', () => {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
        localStream = null;
    }
    socket.emit('leave-call');
    callNotification.style.display = 'none';
});

// Create Room
createRoomButton.addEventListener('click', () => {
    roomCode = generateRoomCode();
    roomCodeDisplay.textContent = roomCode;
    generatedRoomCode.style.display = 'block';
});

// Copy Room Code
copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(roomCode);
    alert('Room Code copied to clipboard!');
});

// Join Room
joinRoomButton.addEventListener('click', () => {
    const code = roomCodeInput.value;
    if (code) {
        socket.emit('join-room', code);
    }
});

// Socket.IO event handlers
socket.on('offer', async (offer) => {
    if (!peerConnection) {
        peerConnection = new RTCPeerConnection(configuration);
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('new-ice-candidate', event.candidate);
            }
        };
        peerConnection.ontrack = (event) => {
            const [remoteStream] = event.streams;
            const audioElement = new Audio();
            audioElement.srcObject = remoteStream;
            audioElement.autoplay = true;
        };
    }
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', answer);
});

socket.on('answer', async (answer) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on('new-ice-candidate', async (candidate) => {
    try {
        await peerConnection.addIceCandidate(candidate);
    } catch (error) {
        console.error('Error adding ICE candidate:', error);
    }
});

// Handle notification for when call starts
socket.on('call-started', () => {
    callNotification.style.display = 'block';
    callNotification.textContent = 'Call is on';
});

// Handle notification for when call ends
socket.on('call-ended', () => {
    callNotification.style.display = 'none';
    alert('Call has ended.');
    location.reload();
});

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8);
}
