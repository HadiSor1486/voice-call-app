const muteButton = document.getElementById('muteToggle');
const hangupButton = document.getElementById('hangup');
const speakerButton = document.getElementById('speakerToggle');

let localStream = null;
let peerConnection = null;
let isMuted = false;
let isSpeakerMuted = false;

// Socket.IO client for signaling
const socket = io.connect();
const configuration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// Initialize call
async function startCall() {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    peerConnection = new RTCPeerConnection(configuration);
    localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('new-ice-candidate', event.candidate);
        }
    };

    
    peerConnection.ontrack = (event) => {
        document.getElementById('call-notification').style.display = 'block';
        document.getElementById('call-notification').textContent = 'Call is on';
    
        const [remoteStream] = event.streams;
        const audioElement = new Audio();
        audioElement.srcObject = remoteStream;
        audioElement.autoplay = true;

        // Toggle speaker mute
        speakerButton.addEventListener('click', () => {
            isSpeakerMuted = !isSpeakerMuted;
            audioElement.muted = isSpeakerMuted;
            speakerButton.querySelector('i').classList.toggle('fa-volume-mute', isSpeakerMuted);
            speakerButton.querySelector('i').classList.toggle('fa-volume-up', !isSpeakerMuted);
        });
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', offer);
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
    
    socket.emit('leave-call', { room: currentRoom });
    document.getElementById('call-notification').style.display = 'none';
    
});

// Socket.IO event handlers
socket.on('offer', async (offer) => {
    if (!peerConnection) {
        peerConnection = new RTCPeerConnection(configuration);
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('new-ice-candidate', event.candidate);
            }
        };
        
    peerConnection.ontrack = (event) => {
        document.getElementById('call-notification').style.display = 'block';
        document.getElementById('call-notification').textContent = 'Call is on';
    
            const [remoteStream] = event.streams;
            const audioElement = new Audio();
            audioElement.srcObject = remoteStream;
            audioElement.autoplay = true;
        };
    }
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', answer);
});

socket.on('answer', async (answer) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on('new-ice-candidate', async (candidate) => {
    try {
        await peerConnection.addIceCandidate(candidate);
    } catch (error) {
        console.error('Error adding ICE candidate:', error);
    }
});
