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

let localStream;
let peerConnection;
let currentRoom;
let participantsInRoom = 0;

// Ice server configuration
const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

// Copy Room Code Functionality
copyRoomCodeBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(currentRoom).then(() => {
        alert('Room code copied!');
    });
});

// Handle room creation
createRoomBtn.addEventListener('click', () => {
    const roomCode = Math.random().toString(36).substring(2, 8);
    generatedRoomCode.style.display = 'block';
    generatedRoomCode.textContent = `Room Code: ${roomCode}`;
    copyRoomCodeBtn.style.display = 'inline-block';
    currentRoom = roomCode;
    socket.emit('create-room', roomCode);
});

// Handle joining a room
joinRoomBtn.addEventListener('click', () => {
    const roomCode = roomCodeInput.value.trim();
    if (!roomCode) return alert('Please enter a room code.');
    currentRoom = roomCode;
    socket.emit('join-room', roomCode);
});

// Show call page
function showCallPage() {
    landingPage.style.display = 'none';
    callPage.style.display = 'block';
}

// Start call and reset participants count
async function startCall() {
    participantsInRoom = 1; // Local user counts as first participant
    try {
        navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then((stream) => {
            localStream = stream;
            peerConnection = new RTCPeerConnection(iceServers);

            // Add local stream to the connection
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

            socket.emit('room-joined', currentRoom);

            // Create and send offer
            peerConnection.createOffer().then((offer) => {
                peerConnection.setLocalDescription(offer);
                socket.emit('offer', { offer, room: currentRoom });
            });
        });
    } catch (error) {
        console.error('Call start error:', error);
    }
}

// Listen for room-joined confirmation
socket.on('room-joined', () => {
    showCallPage();
    startCall();
});

// Listen for a new user joining
socket.on('user-joined', () => {
    participantsInRoom++;
    if (participantsInRoom >= 2) {
        callNotification.textContent = 'Peer Joined';
        callNotification.style.display = 'block';

        // Automatically hide after 3 seconds
        setTimeout(() => {
            callNotification.style.display = 'none';
        }, 3000);
    }
});

// Mute functionality
muteBtn.addEventListener('click', () => {
    const audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    muteBtn.querySelector('i').classList.toggle('fa-microphone-slash', !audioTrack.enabled);
    muteBtn.querySelector('i').classList.toggle('fa-microphone', audioTrack.enabled);
});

// Speaker mute functionality
speakerBtn.addEventListener('click', () => {
    const audio = document.querySelector('audio');
    if (audio) {
        audio.muted = !audio.muted;
        speakerBtn.querySelector('i').classList.toggle('fa-volume-mute', audio.muted);
        speakerBtn.querySelector('i').classList.toggle('fa-volume-up', !audio.muted);
    }
});

// Hangup functionality
hangupBtn.addEventListener('click', () => {
    socket.emit('hangup', currentRoom);
    endCall();
});

// End call
function endCall() {
    if (peerConnection) {
        peerConnection.close();
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    location.reload();
}

// Listen for hangup from other peer
socket.on('peer-hangup', () => {
    endCall();
});

// Socket events for handling offer, answer, and ice candidates
socket.on('offer', async ({ offer }) => {
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
