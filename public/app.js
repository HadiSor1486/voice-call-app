const muteButton = document.getElementById('muteToggle');
const hangupButton = document.getElementById('hangup');
const speakerButton = document.getElementById('speakerToggle');

let localStream = null;
let peerConnection = null;
let isMuted = false;
let isSpeakerMuted = false;

// Room context
const ROOM_NAME = prompt("Enter the room code to join:");

// Socket.IO client for signaling
const socket = io.connect();
const configuration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// Initialize call
async function startCall() {
    try {
        // Get user media
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        peerConnection = new RTCPeerConnection(configuration);

        // Add tracks to the peer connection
        localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

        // ICE Candidate handling
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('new-ice-candidate', { candidate: event.candidate, room: ROOM_NAME });
            }
        };

        // Handle remote stream
        peerConnection.ontrack = (event) => {
            const remoteStream = event.streams[0];
            const audioElement = document.createElement('audio');
            audioElement.srcObject = remoteStream;
            audioElement.autoplay = true;
            document.body.appendChild(audioElement);

            // Speaker mute toggle
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
        socket.emit('offer', { offer, room: ROOM_NAME });
    } catch (error) {
        console.error('Error initializing call:', error);
    }
}

// Mute/unmute the microphone
muteButton.addEventListener('click', () => {
    if (localStream) {
        isMuted = !isMuted;
        localStream.getAudioTracks()[0].enabled = !isMuted;
        muteButton.querySelector('i').classList.toggle('fa-microphone-slash', isMuted);
        muteButton.querySelector('i').classList.toggle('fa-microphone', !isMuted);
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
    socket.emit('leave-call', { room: ROOM_NAME });
    alert("Call has been disconnected.");
});

// Socket.IO event handlers
socket.on('offer', async ({ offer }) => {
    if (!peerConnection) {
        peerConnection = new RTCPeerConnection(configuration);
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('new-ice-candidate', { candidate: event.candidate, room: ROOM_NAME });
            }
        };
        peerConnection.ontrack = (event) => {
            const remoteStream = event.streams[0];
            const audioElement = document.createElement('audio');
            audioElement.srcObject = remoteStream;
            audioElement.autoplay = true;
            document.body.appendChild(audioElement);
        };
    }
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', { answer, room: ROOM_NAME });
});

socket.on('answer', async ({ answer }) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on('new-ice-candidate', async ({ candidate }) => {
    try {
        await peerConnection.addIceCandidate(candidate);
    } catch (error) {
        console.error('Error adding ICE candidate:', error);
    }
});
