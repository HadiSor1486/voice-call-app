const socket = io.connect();

// Elements
const createRoomButton = document.getElementById('create-room');
const joinRoomButton = document.getElementById('join-room');
const roomCodeInput = document.getElementById('room-code-input');
const generatedRoomCodeInput = document.getElementById('generated-room-code');
const copyCodeButton = document.getElementById('copy-code');
const roomCodeContainer = document.getElementById('room-code-container');
const landingPage = document.getElementById('landing-page');
const callPage = document.getElementById('call-page');
const callNotification = document.getElementById('call-notification');
const participantsDiv = document.getElementById('participants');

// Call control buttons
const muteButton = document.getElementById('mute-btn');
const hangupButton = document.getElementById('hangup-btn');
const speakerButton = document.getElementById('speaker-btn');

// Variables to control audio
let isMuted = false;
let isSpeakerOn = true;

// Room creation
createRoomButton.addEventListener('click', () => {
    socket.emit('create-room'); // Emit create room event to the server
});

// Room joining
joinRoomButton.addEventListener('click', () => {
    const roomCode = roomCodeInput.value;
    if (roomCode) {
        socket.emit('join-room', roomCode); // Emit join room event with the room code
    }
});

// Copy generated room code
copyCodeButton.addEventListener('click', () => {
    generatedRoomCodeInput.select();
    document.execCommand('copy');
});

// Mute/unmute button logic
muteButton.addEventListener('click', () => {
    isMuted = !isMuted;
    socket.emit('mute', isMuted); // Emit mute/unmute event to the server
    updateMuteButton();
});

// Speaker mute/unmute button logic
speakerButton.addEventListener('click', () => {
    isSpeakerOn = !isSpeakerOn;
    socket.emit('speaker', isSpeakerOn); // Emit speaker toggle event to the server
    updateSpeakerButton();
});

// Hang up button logic
hangupButton.addEventListener('click', () => {
    socket.emit('hangup'); // Emit hangup event to the server
    endCall();
});

// Listen for room code from server (when creating room)
socket.on('room-created', (roomCode) => {
    generatedRoomCodeInput.value = roomCode;
    roomCodeContainer.style.display = 'block';
    landingPage.style.display = 'none'; // Hide the landing page
    callPage.style.display = 'block'; // Show the call page
});

// Listen for errors (invalid room codes, etc.)
socket.on('error', (message) => {
    alert(message);
});

// Handle room join success
socket.on('room-joined', () => {
    landingPage.style.display = 'none';
    callPage.style.display = 'block';
});

// Call started (other user has joined)
socket.on('call-started', () => {
    callNotification.style.display = 'block'; // Show "Call is ON" notification
    participantsDiv.innerHTML = 'You are in the room!'; // Update participants
});

// Handle mute/unmute
socket.on('mute-status', (status) => {
    isMuted = status;
    updateMuteButton();
});

// Handle speaker on/off
socket.on('speaker-status', (status) => {
    isSpeakerOn = status;
    updateSpeakerButton();
});

// Update mute/unmute button icon based on status
function updateMuteButton() {
    const icon = isMuted
        ? 'https://img.icons8.com/ios-filled/50/ffffff/microphone-slash.png' // Mute icon
        : 'https://img.icons8.com/ios-filled/50/ffffff/microphone.png'; // Unmute icon
    muteButton.querySelector('img').src = icon;
}

// Update speaker on/off button icon based on status
function updateSpeakerButton() {
    const icon = isSpeakerOn
        ? 'https://img.icons8.com/ios-filled/50/ffffff/speaker.png' // Speaker on icon
        : 'https://img.icons8.com/ios-filled/50/ffffff/speaker-slash.png'; // Speaker off icon
    speakerButton.querySelector('img').src = icon;
}

// End call logic
function endCall() {
    landingPage.style.display = 'block';
    callPage.style.display = 'none';
    callNotification.style.display = 'none'; // Hide call notification
    participantsDiv.innerHTML = ''; // Clear participants info
}
