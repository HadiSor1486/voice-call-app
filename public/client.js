const socket = io();

let localStream;
let peerConnection;
let currentRoom = null;

const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const muteBtn = document.getElementById('muteBtn');
const hangupBtn = document.getElementById('hangupBtn');
const speakerBtn = document.getElementById('speakerBtn');
const roomCodeInput = document.getElementById('roomCode');
const copyCodeBtn = document.getElementById('copyCodeBtn');
const landingPage = document.getElementById('landing-page');
const callPage = document.getElementById('call-page');
const hostNameElem = document.getElementById('host-name');
const usersInRoomElem = document.getElementById('users-in-room');
const callNotification = document.getElementById('call-notification');

// Create room
createRoomBtn.addEventListener('click', () => {
    const roomCode = generateRoomCode();
    currentRoom = roomCode;
    socket.emit('create-room', roomCode);
    roomCodeInput.value = roomCode;
    roomCodeInput.style.display = 'block';
    copyCodeBtn.style.display = 'inline-block';
    landingPage.style.display = 'none';
});

// Join room
joinRoomBtn.addEventListener('click', () => {
    const roomCode = prompt('Enter Room Code');
    if (roomCode) {
        currentRoom = roomCode;
        socket.emit('join-room', roomCode);
    }
});

// Copy room code to clipboard
copyCodeBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(roomCodeInput.value).then(() => {
        alert('Room code copied!');
    });
});

// Handle socket events
socket.on('room-created', (roomCode) => {
    showCallPage();
});

socket.on('room-joined', () => {
    showCallPage();
});

socket.on('user-joined', (data) => {
    addUserToRoom(data.id);
});

socket.on('user-left', (data) => {
    removeUserFromRoom(data.id);
});

function showCallPage() {
    landingPage.style.display = 'none';
    callPage.style.display = 'block';
    hostNameElem.textContent = `Host: ${socket.id}`;
    usersInRoomElem.textContent = 'Users in room: ' + currentRoom;
}

// Generate a random room code
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Add user to room display
function addUserToRoom(userId) {
    const userElem = document.createElement('p');
    userElem.textContent = `User: ${userId}`;
    usersInRoomElem.appendChild(userElem);
}

// Remove user from room display
function removeUserFromRoom(userId) {
    const userElems = usersInRoomElem.getElementsByTagName('p');
    for (const userElem of userElems) {
        if (userElem.textContent === `User: ${userId}`) {
            userElem.remove();
            break;
        }
    }
}

// Handle mute/unmute button
muteBtn.addEventListener('click', () => {
    const audioTrack = localStream.getTracks().find(track => track.kind === 'audio');
    audioTrack.enabled = !audioTrack.enabled;
    muteBtn.innerHTML = `<img src="${audioTrack.enabled ? 'mute-icon.png' : 'unmute-icon.png'}" alt="Mute">`;
});

// Handle speaker button
speakerBtn.addEventListener('click', () => {
    const audioTracks = peerConnection.getReceivers().map(receiver => receiver.track);
    audioTracks.forEach(track => {
        track.enabled = !track.enabled;
    });
    speakerBtn.innerHTML = `<img src="${audioTracks.some(track => track.enabled) ? 'speaker-on-icon.png' : 'speaker-off-icon.png'}" alt="Speaker">`;
});

// Handle hangup button
hangupBtn.addEventListener('click', () => {
    socket.emit('hangup', currentRoom);
    hangupCall();
});

// Hang up the call
function hangupCall() {
    localStream.getTracks().forEach(track => track.stop());
    peerConnection.close();
    peerConnection = null;
    landingPage.style.display = 'flex';
    callPage.style.display = 'none';
    currentRoom = null;
}

// Handle notifications
socket.on('call-on', () => {
    callNotification.style.display = 'block';
    setTimeout(() => {
        callNotification.style.display = 'none';
    }, 3000);
});

// Signaling (Offer, Answer, ICE candidates)
socket.on('offer', (data) => {
    // Handle the offer and set up the peer connection
});

socket.on('answer', (data) => {
    // Handle the answer
});

socket.on('new-ice-candidate', (data) => {
    // Add ICE candidate
});
