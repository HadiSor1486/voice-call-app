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
const callNotification = document.getElementById('callNotification');

let localStream;
let peerConnection;
let inCall = false;

const mediaConstraints = {
    audio: true,
    video: false // Voice only
};

const config = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

// Create room logic
createRoomBtn.addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    if (!username) {
        alert('Please enter a username.');
        return;
    }
    const roomCode = Math.random().toString(36).substring(2, 10); // Generate a random code
    socket.emit('create-room', { roomCode, username });
    roomCodeSpan.textContent = roomCode;
    roomCodeSection.style.display = 'block';
    joinRoomSection.style.display = 'none';
    await setupLocalStream();
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

        // Notify server that the user is ready with the local stream
        socket.emit('ready');
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

// Handle incoming participants list
socket.on('participants-update', (participants) => {
    participantsList.innerHTML = '';
    participants.forEach(participant => {
        const li = document.createElement('li');
        li.textContent = `${participant.username} is in the room`;
        participantsList.appendChild(li);
    });

    // Create peer connection if there are two participants
    if (participants.length === 2) {
        createPeerConnection(participants[0].id === socket.id ? participants[1].id : participants[0].id);
    }
});

// Create a new peer connection
function createPeerConnection(socketId) {
    peerConnection = new RTCPeerConnection(config);

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

    // Initiate the call
    peerConnection.createOffer()
        .then(offer => {
            return peerConnection.setLocalDescription(offer);
        })
        .then(() => {
            socket.emit('offer', { offer: peerConnection.localDescription, to: socketId });
        })
        .catch(error => console.error('Error creating offer:', error));
}

// WebRTC: Handle offer/answer and ICE candidates
socket.on('offer', async (offer) => {
    peerConnection = new RTCPeerConnection(config);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', { answer, to: offer.from });
});

socket.on('answer', async (answer) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on('new-ice-candidate', (candidate) => {
    const iceCandidate = new RTCIceCandidate(candidate);
    peerConnection.addIceCandidate(iceCandidate).catch(error => console.error('Error adding ICE candidate:', error));
});
