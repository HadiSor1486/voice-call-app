// DOM Elements
const createRoomButton = document.getElementById('create-room');
const joinRoomButton = document.getElementById('join-room');
const copyCodeButton = document.getElementById('copy-code');
const roomCodeInput = document.getElementById('room-code-input');
const generatedRoomCodeElement = document.getElementById('generated-room-code');
const roomCodeContainer = document.getElementById('room-code-container');
const callNotification = document.getElementById('call-notification');
const participantsDiv = document.getElementById('participants');

const muteButton = document.getElementById('mute-btn');
const hangupButton = document.getElementById('hangup-btn');
const speakerButton = document.getElementById('speaker-btn');

// Global variables for media and connection
let localStream = null;
let peerConnection = null;
let isMuted = false;
let isSpeakerMuted = false;

// Socket.IO client for signaling
const socket = io.connect();
const configuration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]  // ICE server for NAT traversal
};

// Function to generate a unique room code
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
}

// Handle room creation
createRoomButton.addEventListener('click', () => {
    const roomCode = generateRoomCode();
    generatedRoomCodeElement.value = roomCode;
    roomCodeContainer.style.display = 'block';
    // Emit the room code to the server to notify other users
    socket.emit('create-room', roomCode);
});

// Handle copying room code to clipboard
copyCodeButton.addEventListener('click', () => {
    navigator.clipboard.writeText(generatedRoomCodeElement.value).then(() => {
        alert('Room code copied to clipboard!');
    });
});

// Handle joining a room with the code entered
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

// Start the call by initializing media and peer connection
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

    // Create and send offer to the peer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', offer);

    // Display the "Call is ON" notification
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

// Hang up the call and close the connection
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

// Add participant to the room display
function updateParticipants(participants) {
    participantsDiv.innerHTML = '';
    participants.forEach((participant) => {
        const participantElement = document.createElement('div');
        participantElement.textContent = `${participant} is in the room`;
        participantsDiv.appendChild(participantElement);
    });
}

// Socket.IO event handlers

// Handle the offer received from the other user
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

// Handle the answer from the other user
socket.on('answer', async (answer) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

// Handle new ICE candidate
socket.on('new-ice-candidate', async (candidate) => {
    try {
        await peerConnection.addIceCandidate(candidate);
    } catch (error) {
        console.error('Error adding ICE candidate:', error);
    }
});

// Handle when the call ends
socket.on('call-ended', () => {
    hangupButton.click();
});

// Handle room creation on the server side
socket.on('room-created', (roomCode) => {
    generatedRoomCodeElement.value = roomCode;
    roomCodeContainer.style.display = 'block';
});

// Handle participants list update
socket.on('update-participants', (participants) => {
    updateParticipants(participants);
});

// Display notification when a new user joins
socket.on('user-joined', (username) => {
    alert(`${username} has joined the room.`);
});
