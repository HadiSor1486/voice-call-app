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
const muteBtn = document.getElementById('mute-btn');
const hangupBtn = document.getElementById('hangup-btn');
const speakerBtn = document.getElementById('speaker-btn');
const callNotification = document.getElementById('call-notification');

let localStream = null;
let peerConnection = null;
let currentRoom = null;
let audioElement = null;

// WebRTC Configuration
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

// Copy Room Code Functionality
copyRoomCodeBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(currentRoom).then(() => {
        alert('Room code copied!');
    });
});

// Create Room
createRoomBtn.addEventListener('click', () => {
    const roomCode = Math.random().toString(36).substring(2, 8);
    generatedRoomCode.style.display = 'block';
    generatedRoomCode.textContent = `Room Code: ${roomCode}`;
    copyRoomCodeBtn.style.display = 'inline-block';
    currentRoom = roomCode;
    socket.emit('create-room', roomCode);
});

// Join Room
joinRoomBtn.addEventListener('click', () => {
    const roomCode = roomCodeInput.value.trim();
    if (!roomCode) return alert('Please enter a room code.');
    currentRoom = roomCode;
    socket.emit('join-room', roomCode);
});

// Socket event to show call page and start call
socket.on('user-joined', (data) => {
    showCallPage();
    updateCallNotification(data.message);
});

socket.on('room-error', (errorMessage) => {
    alert(errorMessage);
});

// Show Call Page
function showCallPage() {
    landingPage.style.display = 'none';
    callPage.style.display = 'block';
    startCall();
}

// Update call notification
function updateCallNotification(message) {
    callNotification.textContent = message;
    callNotification.style.display = 'block';
    setTimeout(() => {
        callNotification.style.display = 'none';
    }, 3000);
}

// Initialize Call
async function startCall() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

        peerConnection = new RTCPeerConnection(configuration);
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
            audioElement = new Audio();
            audioElement.srcObject = event.streams[0];
            audioElement.autoplay = true;
        };

        // Create offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('offer', { offer, room: currentRoom });
        socket.emit('store-offer', { offer, room: currentRoom });
    } catch (error) {
        console.error('Call start error:', error);
        alert('Could not start the call. Please check your microphone permissions.');
    }
}

// Handle incoming offer
socket.on('offer', async (data) => {
    if (!peerConnection) {
        await startCall();
    }
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', { answer, room: currentRoom });
});

// Handle incoming answer
socket.on('answer', async (data) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
});

// Handle ICE candidates
socket.on('new-ice-candidate', async (data) => {
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (error) {
        console.error('Error adding ICE candidate:', error);
    }
});

// Mute Functionality
muteBtn.addEventListener('click', () => {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
        muteBtn.querySelector('i').classList.toggle('fa-microphone-slash');
        muteBtn.querySelector('i').classList.toggle('fa-microphone');
    }
});

// Speaker Mute Functionality
speakerBtn.addEventListener('click', () => {
    if (audioElement) {
        audioElement.muted = !audioElement.muted;
        speakerBtn.querySelector('i').classList.toggle('fa-volume-mute');
        speakerBtn.querySelector('i').classList.toggle('fa-volume-up');
    }
});

// Hangup Functionality
hangupBtn.addEventListener('click', () => {
    socket.emit('hangup', currentRoom);
    endCall();
});

// Peer Hangup Handling
socket.on('peer-hangup', () => {
    updateCallNotification('Peer has ended the call');
    endCall();
});

// End Call Function
function endCall() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
        localStream = null;
    }
    if (audioElement) {
        audioElement.pause();
        audioElement = null;
    }
    location.reload();
}