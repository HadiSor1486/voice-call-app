const socket = io.connect();

// UI Elements
const createRoomButton = document.getElementById('createRoom');
const joinRoomButton = document.getElementById('joinRoom');
const roomInput = document.getElementById('roomInput');
const muteButton = document.getElementById('muteToggle');
const hangupButton = document.getElementById('hangupToggle');
const speakerMuteButton = document.getElementById('speakerMuteToggle');
let localStream = null;
let peerConnection = null;
let isMuted = false;
let speakerMuted = false;
let currentRoom = null;

// WebRTC Configuration
const configuration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// Handle Create Room
createRoomButton.addEventListener('click', () => {
  const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  currentRoom = roomCode;
  alert(`Room created! Share this code with your friend: ${roomCode}`);
  socket.emit('create-room', roomCode);
});

// Handle Join Room
joinRoomButton.addEventListener('click', async () => {
  const roomCode = roomInput.value.trim();
  if (!roomCode) {
    alert('Please enter a room code!');
    return;
  }

  currentRoom = roomCode;
  socket.emit('join-room', roomCode);

  // Initialize Local Audio Stream
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

  // Create Peer Connection
  peerConnection = new RTCPeerConnection(configuration);

  // Add Local Tracks
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  // Handle Remote Tracks
  peerConnection.ontrack = event => {
    const [remoteStream] = event.streams;
    const audioElement = new Audio();
    audioElement.srcObject = remoteStream;
    audioElement.play();
  };

  // ICE Candidate Handling
  peerConnection.onicecandidate = event => {
    if (event.candidate) {
      socket.emit('new-ice-candidate', { candidate: event.candidate, room: currentRoom });
    }
  };

  // Create and Send Offer
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit('offer', { offer, room: currentRoom });
});

// Socket Handlers
socket.on('offer', async ({ offer }) => {
  if (!peerConnection) {
    peerConnection = new RTCPeerConnection(configuration);

    // Handle Remote Tracks
    peerConnection.ontrack = event => {
      const [remoteStream] = event.streams;
      const audioElement = new Audio();
      audioElement.srcObject = remoteStream;
      audioElement.play();
    };

    // ICE Candidate Handling
    peerConnection.onicecandidate = event => {
      if (event.candidate) {
        socket.emit('new-ice-candidate', { candidate: event.candidate, room: currentRoom });
      }
    };
  }

  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit('answer', { answer, room: currentRoom });
});

socket.on('answer', async ({ answer }) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on('new-ice-candidate', async ({ candidate }) => {
  if (peerConnection) {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  }
});

// Buttons Functionality
muteButton.addEventListener('click', () => {
  isMuted = !isMuted;
  localStream.getAudioTracks()[0].enabled = !isMuted;
  muteButton.textContent = isMuted ? 'Unmute' : 'Mute';
});

hangupButton.addEventListener('click', () => {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  alert('Call ended!');
});

speakerMuteButton.addEventListener('click', () => {
  speakerMuted = !speakerMuted;
  if (peerConnection) {
    const remoteAudioTracks = peerConnection.getReceivers().map(receiver => receiver.track);
    remoteAudioTracks.forEach(track => (track.enabled = !speakerMuted));
  }
  speakerMuteButton.textContent = speakerMuted ? 'Unmute Speaker' : 'Mute Speaker';
});
