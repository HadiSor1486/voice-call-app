const socket = io();

// Landing Page Elements
const landingPage = document.getElementById('landing-page');
const createRoomBtn = document.getElementById('create-room');
const joinRoomBtn = document.getElementById('join-room');
const roomCodeInput = document.getElementById('room-code-input');
const generatedRoomCode = document.getElementById('generated-room-code');

// Call Page Elements
const callPage = document.getElementById('call-page');
const muteBtn = document.getElementById('mute-btn');
const hangupBtn = document.getElementById('hangup-btn');
const speakerBtn = document.getElementById('speaker-btn');

let localStream;
let peerConnection;
let currentRoom;

// Ice server configuration
const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

// Handle room creation
createRoomBtn.addEventListener('click', () => {
    const roomCode = Math.random().toString(36).substring(2, 8);
    
    generatedRoomCode.style.display = 'block';
    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy';
    copyBtn.style.marginLeft = '10px';
    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(roomCode).then(() => {
            alert('Room code copied to clipboard!');
        });
    });
    generatedRoomCode.appendChild(copyBtn);
    
    generatedRoomCode.textContent = `Room Code: ${roomCode}`;
    currentRoom = roomCode;
    socket.emit('create-room', roomCode);
});

// Handle joining a room
joinRoomBtn.addEventListener('click', () => {
    const roomCode = roomCodeInput.value.trim();
    if (!roomCode) return alert('Please enter a room code.');
    currentRoom = roomCode;
    socket.emit('join-room', roomCode);
    showCallPage();
});

// Show call page
function showCallPage() {
    landingPage.style.display = 'none';
    callPage.style.display = 'block';
    startCall();
}

// Handle WebRTC connection
function startCall() {
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

        peerConnection.createOffer().then((offer) => {
            peerConnection.setLocalDescription(offer);
            socket.emit('offer', { offer, room: currentRoom });
        });
    });
}

// Mute functionality
muteBtn.addEventListener('click', () => {
    localStream.getAudioTracks()[0].enabled = !localStream.getAudioTracks()[0].enabled;
    muteBtn.textContent = localStream.getAudioTracks()[0].enabled ? 'Mute' : 'Unmute';
});

// Speaker mute functionality
speakerBtn.addEventListener('click', () => {
    const audio = document.querySelector('audio');
    if (audio) {
        
    audio.muted = !audio.muted;
    speakerBtn.textContent = audio.muted ? 'Speaker On' : 'Speaker Off';
    
        speakerBtn.textContent = audio.muted ? 'Speaker On' : 'Speaker Off';
    }
});

// Hangup functionality
hangupBtn.addEventListener('click', () => {
    peerConnection.close();
    
    socket.emit('leave-call', { room: currentRoom });
    location.reload();
    
});
