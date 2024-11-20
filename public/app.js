const createRoomButton = document.getElementById('create-room');
const joinRoomButton = document.getElementById('join-room');
const copyCodeButton = document.getElementById('copy-code');
const roomCodeInput = document.getElementById('room-code-input');
const generatedRoomCodeElement = document.getElementById('generated-room-code');
const roomCodeContainer = document.getElementById('room-code-container');
const callNotification = document.getElementById('call-notification');

const muteButton = document.getElementById('mute-btn');
const hangupButton = document.getElementById('hangup-btn');
const speakerButton = document.getElementById('speaker-btn');

let localStream = null;
let peerConnection = null;
let isMuted = false;
let isSpeakerMuted = false;

// Socket.IO client for signaling
const socket = io.connect();
const configuration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// Function to create a unique room code
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
}

// Handle room creation
createRoomButton.addEventListener('click', () => {
    const roomCode = generateRoomCode();
    generatedRoomCodeElement.value = roomCode;
    roomCodeContainer.style.display = 'block';
});

// Handle copying room code
copyCodeButton.addEventListener('click', () => {
    navigator.clipboard.writeText(generatedRoomCodeElement.value).then(() => {
        alert('Room code copied to clipboard!');
    });
});

// Handle joining a room
joinRoomButton.addEventListener('click', () => {
    const roomCode = roomCodeInput.value.trim();
    if (roomCode) {
        socket.emit('join-room', roomCode);
        document.getElementById('landing-page').style.display = 'none';
        document.getElementById('call-page').style.display = 'block';
        startCall();
    } else {
        alert('Please enter a valid room code.');
    }
});

// Initialize call
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

        // Toggle speaker mute
        speakerButton.addEventListener('click', () => {
            isSpeakerMuted = !isSpeakerMuted;
            audioElement.muted = isSpeakerMuted;
            updateSpeakerIcon(isSpeakerMuted);
        });
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', offer);

    // Display call notification
    showCallNotification();
}

// Mute/unmute the microphone
muteButton.addEventListener('click', () => {
    if (localStream) {
        isMuted = !isMuted;
        localStream.getAudioTracks()[0].enabled = !isMuted;
        updateMuteIcon(isMuted);
    }
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
    // Hide call notification
    hideCallNotification();
});

// Update the mute button icon
function updateMuteIcon(muted) {
    const muteIcon = muteButton.querySelector('img');
    muteIcon.src = muted
        ? 'https://img.icons8.com/ios-filled/50/ffffff/mute.png'
        : 'https://img.icons8.com/ios-filled/50/ffffff/microphone.png';
}

// Update the speaker button icon
function updateSpeakerIcon(speakerMuted) {
    const speakerIcon = speakerButton.querySelector('img');
    speakerIcon.src = speakerMuted
        ? 'https://img.icons8.com/ios-filled/50/ffffff/no-audio.png'
        : 'https://img.icons8.com/ios-filled/50/ffffff/speaker.png';
}

// Show the "Call is ON" notification
function showCallNotification() {
    callNotification.style.display = 'block';
}

// Hide the "Call is ON" notification
function hideCallNotification() {
    callNotification.style.display = 'none';
}

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
