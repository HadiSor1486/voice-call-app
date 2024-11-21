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
let isMuted = false;
let isSpeakerMuted = false;

// WebRTC Configuration
const configuration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
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

// Show Call Page
function showCallPage() {
    landingPage.style.display = 'none';
    callPage.style.display = 'block';
    startCall();
}

// Initialize Call
async function startCall() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        peerConnection = new RTCPeerConnection(configuration);
        localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('new-ice-candidate', {
                    candidate: event.candidate,
                    room: currentRoom
                });
            }
        };

        peerConnection.ontrack = (event) => {
            const [remoteStream] = event.streams;
            const audioElement = new Audio();
            audioElement.srcObject = remoteStream;
            audioElement.autoplay = true;

            // Show call notification
            callNotification.style.display = 'block';

            // Toggle speaker mute
            speakerButton.addEventListener('click', () => {
                isSpeakerMuted = !isSpeakerMuted;
                audioElement.muted = isSpeakerMuted;
                speakerButton.querySelector('i').classList.toggle('fa-volume-mute', isSpeakerMuted);
                speakerButton.querySelector('i').classList.toggle('fa-volume-up', !isSpeakerMuted);
            });
        };

        // Create and send offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('offer', { offer, room: currentRoom });

    } catch (error) {
        console.error('Error starting call:', error);
        alert('Could not start the call. Please check your microphone permissions.');
    }
}

// Mute/Unmute Microphone
muteButton.addEventListener('click', () => {
    if (localStream) {
        isMuted = !isMuted;
        localStream.getAudioTracks()[0].enabled = !isMuted;
        muteButton.querySelector('i').classList.toggle('fa-microphone-slash', isMuted);
        muteButton.querySelector('i').classList.toggle('fa-microphone', !isMuted);
    }
});

// Hang Up Call
hangupButton.addEventListener('click', () => {
    socket.emit('hangup', currentRoom);
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
    location.reload();
}

// Socket.IO Event Handlers
socket.on('room-created', () => {
    console.log('Room created successfully.');
});

socket.on('room-joined', () => {
    console.log('Joined room successfully.');
    showCallPage();
});

socket.on('offer', async (data) => {
    if (!peerConnection) {
        peerConnection = new RTCPeerConnection(configuration);
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('new-ice-candidate', {
                    candidate: event.candidate,
                    room: currentRoom
                });
            }
        };
    }

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
        console.error('Error adding ICE candidate:', error);
    }
});

// Peer Hangup Event
socket.on('peer-hangup', () => {
    endCall();
});
