const socket = io.connect();

// Elements
const muteButton = document.getElementById('mute-btn');
const hangupButton = document.getElementById('hangup-btn');
const speakerButton = document.getElementById('speaker-btn');
const callNotification = document.getElementById('call-notification');
const participantsDiv = document.getElementById('participants');
let localStream = null;
let peerConnection = null;
let isMuted = false;
let isSpeakerMuted = false;

// WebRTC Configuration
const configuration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// Handle incoming call notifications
socket.on('call-started', () => {
    callNotification.style.display = 'block';
    setTimeout(() => callNotification.style.display = 'none', 5000);
});

// Handle call end
socket.on('call-ended', () => {
    endCall();
});

// Mute/unmute microphone
muteButton.addEventListener('click', () => {
    if (localStream) {
        isMuted = !isMuted;
        localStream.getAudioTracks()[0].enabled = !isMuted;
        updateMuteIcon(isMuted);
    }
});

// Hang up the call
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
    callNotification.style.display = 'none'; // Hide call notification
});

// Toggle speaker on/off
speakerButton.addEventListener('click', () => {
    isSpeakerMuted = !isSpeakerMuted;
    const audioElement = document.querySelector('audio');
    if (audioElement) {
        audioElement.muted = isSpeakerMuted;
        updateSpeakerIcon(isSpeakerMuted);
    }
});

// Initialize local stream and start the call
async function startCall(roomCode) {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Create peer connection
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
        participantsDiv.appendChild(audioElement);
    };

    // Create offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', offer);
}

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

// Receive offer from the other peer
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
            participantsDiv.appendChild(audioElement);
        };
    }

    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', answer);
});

// Receive answer from the other peer
socket.on('answer', async (answer) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

// Add ICE candidates from other peers
socket.on('new-ice-candidate', async (candidate) => {
    try {
        await peerConnection.addIceCandidate(candidate);
    } catch (error) {
        console.error('Error adding ICE candidate:', error);
    }
});

// Handle room joining
socket.on('room-full', () => {
    alert('The room is full. Please try again later.');
});
