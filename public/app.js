const socket = io();

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
let peerConnections = {};
const mediaConstraints = {
    audio: true,
    video: false  // We are only interested in audio for this voice call
};

// Check if microphone access is granted
async function checkMicrophoneAccess() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        console.log('Microphone access granted.');
        return true;
    } catch (error) {
        console.error('Could not access microphone:', error);
        alert('Could not access microphone. Please check your device settings.');
        return false;
    }
}

// Create room logic
createRoomBtn.addEventListener('click', async () => {
    console.log("Create Room button clicked");
    const username = usernameInput.value.trim();
    if (!username) {
        alert('Please enter a username.');
        return;
    }

    const hasMicAccess = await checkMicrophoneAccess();
    if (!hasMicAccess) return;  // Stop if microphone access is denied

    const roomCode = Math.random().toString(36).substring(2, 10);  // Generate a random code
    socket.emit('create-room', { roomCode, username });
    roomCodeSpan.textContent = roomCode;
    roomCodeSection.style.display = 'block';
    joinRoomSection.style.display = 'none';
    await setupLocalStream();
    console.log(`Room created with code: ${roomCode}`);
});

// Copy room code logic
copyRoomCodeBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(roomCodeSpan.textContent);
    alert('Room code copied!');
});

// Join room logic
joinRoomBtn.addEventListener('click', () => {
    console.log("Join Room button clicked");
    const username = usernameInput.value.trim();
    if (!username) {
        alert('Please enter a username.');
        return;
    }
    roomCodeSection.style.display = 'none';
    joinRoomSection.style.display = 'block';
});

joinRoomBtnConfirm.addEventListener('click', async () => {
    console.log("Join Room confirmation clicked");
    const roomCode = roomCodeInput.value.trim();
    const username = usernameInput.value.trim();
    if (!roomCode || !username) {
        alert('Please enter both a username and room code.');
        return;
    }

    const hasMicAccess = await checkMicrophoneAccess();
    if (!hasMicAccess) return;  // Stop if microphone access is denied

    socket.emit('join-room', { roomCode, username });
    await setupLocalStream();
    console.log(`Attempting to join room with code: ${roomCode}`);
});

// Setup the local audio stream
async function setupLocalStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
        muteBtn.style.display = 'block';
        console.log("Audio stream set up successfully");
    } catch (error) {
        console.error('Error accessing media devices:', error);
        alert('Could not access your microphone. Please check your device settings.');
    }
}

// Handle incoming participants list
socket.on('participants-update', (participants) => {
    participantsList.innerHTML = '';
    participants.forEach(participant => {
        const li = document.createElement('li');
        li.textContent = `${participant.username} is in the room`;
        participantsList.appendChild(li);
    });
    console.log("Participants updated", participants);
});

// WebRTC: Handle offer/answer and ICE candidates
socket.on('offer', async (offer) => {
    const peerConnection = createPeerConnection(offer.from);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', { answer, to: offer.from });
});

socket.on('answer', async (answer) => {
    const peerConnection = peerConnections[answer.from];
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on('new-ice-candidate', (candidate) => {
    const peerConnection = peerConnections[candidate.from];
    peerConnection.addIceCandidate(new RTCIceCandidate(candidate.candidate));
});

// Create a new peer connection
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
        remoteAudio.play();  // Auto-play the audio when received
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

// Mute and Unmute logic
muteBtn.addEventListener('click', () => {
    localStream.getAudioTracks()[0].enabled = false; // Mute
    muteBtn.style.display = 'none';
    unmuteBtn.style.display = 'block';
});

unmuteBtn.addEventListener('click', () => {
    localStream.getAudioTracks()[0].enabled = true; // Unmute
    muteBtn.style.display = 'block';
    unmuteBtn.style.display = 'none';
});
