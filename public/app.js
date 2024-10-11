const joinButton = document.getElementById('joinCall');
const muteButton = document.getElementById('muteToggle');
const callNotification = document.getElementById('callNotification');

let localStream = null;
let peerConnection = null;
let isMuted = false;
let inCall = false;

// Socket.IO client for signaling
const socket = io.connect();

// WebRTC configuration (STUN server to help peers find each other)
const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
  ]
};

// Handle the button click to join the call
joinButton.addEventListener('click', async () => {
  // Get audio stream from the microphone
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

  // Show mute button and hide join button
  muteButton.style.display = 'inline';
  joinButton.style.display = 'none';

  // Initialize the peer connection
  peerConnection = new RTCPeerConnection(configuration);

  // Add the local audio stream to the peer connection
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  // Handle incoming ICE candidates from the other peer
  peerConnection.onicecandidate = event => {
    if (event.candidate) {
      socket.emit('new-ice-candidate', event.candidate);
    }
  };

  // Handle when the other peer adds a stream
  peerConnection.ontrack = event => {
    const [remoteStream] = event.streams;
    const audioElement = new Audio();
    audioElement.srcObject = remoteStream;
    audioElement.play();

    // Show notification when another user joins
    callNotification.style.display = 'block';
  };

  // Send an offer to the server to join the call
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit('offer', offer);
  
  // Update notification status
  inCall = true;
});

// Toggle mute/unmute
muteButton.addEventListener('click', () => {
  isMuted = !isMuted;
  localStream.getAudioTracks()[0].enabled = !isMuted;
  muteButton.textContent = isMuted ? 'Unmute' : 'Mute';
});

// Socket.IO event handlers
socket.on('offer', async (offer) => {
  if (!peerConnection) {
    peerConnection = new RTCPeerConnection(configuration);
    peerConnection.onicecandidate = event => {
      if (event.candidate) {
        socket.emit('new-ice-candidate', event.candidate);
      }
    };
    peerConnection.ontrack = event => {
      const [remoteStream] = event.streams;
      const audioElement = new Audio();
      audioElement.srcObject = remoteStream;
      audioElement.play();

      // Show notification when another user joins
      callNotification.style.display = 'block';
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
    console.error('Error adding received ICE candidate', error);
  }
});

// Handle when the other peer leaves the call
socket.on('user-left', () => {
  callNotification.style.display = 'none';
});
