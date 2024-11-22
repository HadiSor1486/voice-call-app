const socket = io();

// Global state
let state = {
    localStream: null,
    peerConnections: new Map(), // {userId: RTCPeerConnection}
    currentRoom: null,
    localUser: {
        id: null,
        profilePicture: null,
        isMuted: false
    },
    participants: new Map() // {userId: {profilePicture, isMuted}}
};

// DOM Elements
const elements = {
    landingPage: document.getElementById('landing-page'),
    callPage: document.getElementById('call-page'),
    createRoomBtn: document.getElementById('create-room'),
    joinRoomBtn: document.getElementById('join-room'),
    roomCodeInput: document.getElementById('room-code-input'),
    generatedRoomCode: document.getElementById('generated-room-code'),
    roomCodeText: document.getElementById('room-code-text'),
    copyRoomCodeBtn: document.getElementById('copy-room-code'),
    participantsGrid: document.getElementById('participants-grid'),
    muteBtn: document.getElementById('mute-btn'),
    hangupBtn: document.getElementById('hangup-btn'),
    speakerBtn: document.getElementById('speaker-btn'),
    profileUpload: document.getElementById('profile-upload'),
    profileImage: document.getElementById('profile-image')
};

const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

// Profile Picture Handling
elements.profileUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const profilePicture = e.target.result;
            elements.profileImage.src = profilePicture;
            state.localUser.profilePicture = profilePicture;
        };
        reader.readAsDataURL(file);
    }
});

elements.profileImage.parentElement.addEventListener('click', () => {
    elements.profileUpload.click();
});

// Room Creation and Joining
elements.createRoomBtn.addEventListener('click', () => {
    if (!state.localUser.profilePicture) {
        return alert('Please select a profile picture first.');
    }
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    elements.generatedRoomCode.style.display = 'flex';
    elements.roomCodeText.textContent = roomCode;
    state.currentRoom = roomCode;
    socket.emit('create-room', { roomCode, profilePicture: state.localUser.profilePicture });
});

elements.joinRoomBtn.addEventListener('click', () => {
    if (!state.localUser.profilePicture) {
        return alert('Please select a profile picture first.');
    }
    const roomCode = elements.roomCodeInput.value.trim().toUpperCase();
    if (!roomCode) return alert('Please enter a room code.');
    state.currentRoom = roomCode;
    socket.emit('join-room', { roomCode, profilePicture: state.localUser.profilePicture });
    showCallPage();
});

// UI Updates
function updateParticipantsGrid() {
    elements.participantsGrid.innerHTML = '';
    
    // Calculate positions in a circle
    const participants = Array.from(state.participants.entries());
    const totalParticipants = participants.length + 1; // Include local user
    const radius = 150; // Adjust based on your needs
    const centerX = 250;
    const centerY = 250;

    // Add local user
    const localAngle = (2 * Math.PI * 0) / totalParticipants;
    const localX = centerX + radius * Math.cos(localAngle);
    const localY = centerY + radius * Math.sin(localAngle);
    addParticipantElement('local', state.localUser, localX, localY);

    // Add other participants
    participants.forEach(([userId, user], index) => {
        const angle = (2 * Math.PI * (index + 1)) / totalParticipants;
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        addParticipantElement(userId, user, x, y);
    });
}

function addParticipantElement(userId, user, x, y) {
    const participant = document.createElement('div');
    participant.className = 'participant';
    participant.style.transform = `translate(${x - 75}px, ${y - 75}px)`; // Center the element

    participant.innerHTML = `
        <img src="${user.profilePicture || '/assets/default-avatar.png'}" alt="Participant">
        ${user.isMuted ? '<div class="mute-indicator"><i class="fas fa-microphone-slash"></i></div>' : ''}
    `;

    elements.participantsGrid.appendChild(participant);
}

// WebRTC Handling
async function setupPeerConnection(userId) {
    const peerConnection = new RTCPeerConnection(iceServers);
    state.peerConnections.set(userId, peerConnection);

    // Add local stream
    state.localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, state.localStream);
    });

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                candidate: event.candidate,
                userId,
                room: state.currentRoom
            });
        }
    };

    // Handle incoming tracks
    peerConnection.ontrack = (event) => {
        const audio = document.createElement('audio');
        audio.srcObject = event.streams[0];
        audio.autoplay = true;
        audio.id = `audio-${userId}`;
        document.body.appendChild(audio);
    };

    return peerConnection;
}

// Socket Event Handlers
socket.on('user-joined', async ({ userId, profilePicture }) => {
    state.participants.set(userId, { profilePicture, isMuted: false });
    updateParticipantsGrid();

    const peerConnection = await setupPeerConnection(userId);
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', { offer, userId, room: state.currentRoom });
});

socket.on('offer', async ({ offer, userId, profilePicture }) => {
    state.participants.set(userId, { profilePicture, isMuted: false });
    updateParticipantsGrid();

    const peerConnection = await setupPeerConnection(userId);
    await peerConnection.setRemoteDescription(offer);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', { answer, userId, room: state.currentRoom });
});

socket.on('answer', async ({ answer, userId }) => {
    const peerConnection = state.peerConnections.get(userId);
    await peerConnection.setRemoteDescription(answer);
});

socket.on('ice-candidate', ({ candidate, userId }) => {
    const peerConnection = state.peerConnections.get(userId);
    if (peerConnection) {
        peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
});

socket.on('user-left', ({ userId }) => {
    state.participants.delete(userId);
    updateParticipantsGrid();
    
    const peerConnection = state.peerConnections.get(userId);
    if (peerConnection) {
        peerConnection.close();
        state.peerConnections.delete(userId);
    }
    
    const audio = document.getElementById(`audio-${userId}`);
    if (audio) audio.remove();
});

// Control Buttons
elements.muteBtn.addEventListener('click', () => {
    const audioTrack = state.localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    state.localUser.isMuted = !audioTrack.enabled;
    elements.muteBtn.querySelector('i').classList.toggle('fa-microphone-slash');
    elements.muteBtn.querySelector('i').classList.toggle('fa-microphone');
    
    socket.emit('user-mute', {
        room: state.currentRoom,
        isMuted: state.localUser.isMuted
    });
    updateParticipantsGrid();
});

socket.on('user-mute', ({ userId, isMuted }) => {
    if (state.participants.has(userId)) {
        state.participants.get(userId).isMuted = isMuted;
        updateParticipantsGrid();
    }
});

// Initialize call
async function startCall() {
    try {
        state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        showCallPage();
    } catch (error) {
        console.error('Error accessing media devices:', error);
        alert('Unable to access microphone. Please check permissions.');
    }
}

export default { startCall };