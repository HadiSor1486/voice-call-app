const socket = io();  // Initialize Socket.IO

// HTML elements
const createRoomBtn = document.getElementById('createRoom');
const joinRoomBtn = document.getElementById('joinRoom');
const usernameInput = document.getElementById('username');
const roomCodeSection = document.getElementById('roomCodeSection');
const roomCodeSpan = document.getElementById('roomCode');
const copyRoomCodeBtn = document.getElementById('copyRoomCode');
const joinRoomSection = document.getElementById('joinRoomSection');
const roomCodeInput = document.getElementById('roomCodeInput');
const joinRoomBtnConfirm = document.getElementById('joinRoomBtn');
const participantsList = document.getElementById('participantsList');
const muteBtn = document.getElementById('muteBtn');
const unmuteBtn = document.getElementById('unmuteBtn');

let localStream;
let peerConnections = {};  // Store peer connections for each connected peer
const mediaConstraints = {
    audio: true,
    video: false  // Voice only
};

// Create room logic
createRoomBtn.addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    if (!username) {
        alert('Please enter a username.');
        return;
    }
    const roomCode = Math.random().toString(36).substring(2, 10);  // Generate a random code
    socket.emit('create-room', { roomCode, username });
    roomCodeSpan.textContent = roomCode;
    roomCodeSection.style.display = 'block';
    joinRoomSection.style.display = 'none';
    await setupLocalStream();
});

// Copy room code
copyRoomCodeBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(roomCodeSpan.textContent);
    alert('Room code copied!');
});

// Join room logic
joinRoomBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    if (!username) {
        alert('Please enter a username.');
        return;
    }
    roomCodeSection.style.display = 'none';
    joinRoomSection.style.display = 'block';
});

joinRoomBtnConfirm.addEventListener('click', async () => {
    const roomCode = roomCodeInput.value.trim();
    const username = usernameInput.value.trim();
    if (!roomCode || !username) {
        alert('Please enter both a username and room code.');
        return;
    }
    socket.emit('join-room', { roomCode, username });
    await setupLocalStream();
});

// Setup the local audio stream
async function setupLocalStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
        muteBtn.style.display = 'block';
        unmuteBtn.style.display = 'none';
    } catch (error) {
        console.error('Error accessing microphone:', error);
        alert('Could not access your microphone. Please check your device settings.');
    }
}

// Handle mute and unmute buttons
muteBtn.addEventListener('click', () => {
    localStream.getAudioTracks()[0].enabled = false;
    muteBtn.style.display = 'none';
    unmuteBtn.style.display = 'block';
});

unmuteBtn.addEventListener('click', () => {
    localStream.getAudioTracks()[0].enabled = true;
    muteBtn.style.display = 'block';
    unmuteBtn.style.display = 'none';
});

// Handle WebRTC peer connection setup
function createPeerConnection(socketId) {
    const peerConnection = new RTCPeerConnection();

    // Add local audio stream to the peer connection
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    // Handle remote audio stream
    peerConnection.ontrack = (event) => {
        const remoteAudio = new Audio();
        remoteAudio.srcObject = event.streams[0];
        remoteAudio.play();  // Auto-play the remote audio when received
        console.log("Received remote audio stream");
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('new-ice-candidate', { candidate: event.candidate, to: socketId });
        }
    };

    peerConnections[socketId] = peerConnection;
    return peerConnection;
}

// WebRTC: Handle offer from a peer
socket.on('offer', async (offer) => {
    const peerConnection = createPeerConnection(offer.from);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', { answer, to: offer.from });
});

// WebRTC: Handle answer from a peer
socket.on('answer', async (answer) => {
    const peerConnection = peerConnections[answer.from];
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

// Handle incoming ICE candidates
socket.on('new-ice-candidate', async (candidate) => {
    const peerConnection = peerConnections[candidate.from];
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate.candidate));
});

// WebRTC: When a new user joins, create an offer for them
socket.on('new-participant', async (socketId) => {
    const peerConnection = createPeerConnection(socketId);
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', { offer, to: socketId });
});

// Handle participants update
socket.on('participants-update', (participants) => {
    participantsList.innerHTML = '';
    participants.forEach(participant => {
        const li = document.createElement('li');
        li.textContent = `${participant.username} is in the room`;
        participantsList.appendChild(li);
    });
});
