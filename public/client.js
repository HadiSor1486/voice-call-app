const socket = io();

const landingPage = document.getElementById('landing-page');
const callPage = document.getElementById('call-page');
const createRoomBtn = document.getElementById('create-room');
const joinRoomBtn = document.getElementById('join-room');
const roomCodeInput = document.getElementById('room-code-input');
const generatedRoomCode = document.getElementById('generated-room-code');
const roomCodeText = document.getElementById('room-code-text');
const copyRoomCodeBtn = document.getElementById('copy-room-code');
const profileUpload = document.getElementById('profile-upload');
const profileImage = document.getElementById('profile-image');
const profileName = document.getElementById('profile-name');

const muteBtn = document.getElementById('mute-btn');
const hangupBtn = document.getElementById('hangup-btn');
const speakerBtn = document.getElementById('speaker-btn');
const participantsGrid = document.getElementById('participants-grid');

let localStream;
let peerConnection;
let currentRoom;
let isCallConnected = false;
let userProfile = {
    image: '/assets/default-avatar.png',
    id: null
};

const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Profile picture handling
profileUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            profileImage.src = event.target.result;
            userProfile.image = event.target.result;
            localStorage.setItem('userProfileImage', event.target.result);
        };
        reader.readAsDataURL(file);
    }
});

// Load saved profile picture if exists
const savedProfileImage = localStorage.getItem('userProfileImage');
if (savedProfileImage) {
    profileImage.src = savedProfileImage;
    userProfile.image = savedProfileImage;
}

document.querySelector('.profile-image-container').addEventListener('click', () => {
    profileUpload.click();
});

// Room creation and joining
createRoomBtn.addEventListener('click', () => {
    if (!userProfile.image) {
        alert('Please set a profile picture first');
        return;
    }
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    generatedRoomCode.style.display = 'flex';
    roomCodeText.textContent = roomCode;
    currentRoom = roomCode;
    socket.emit('create-room', { room: roomCode, profile: userProfile });
});

joinRoomBtn.addEventListener('click', () => {
    if (!userProfile.image) {
        alert('Please set a profile picture first');
        return;
    }
    const roomCode = roomCodeInput.value.trim().toUpperCase();
    if (!roomCode) return alert('Please enter a room code.');
    currentRoom = roomCode;
    socket.emit('join-room', { room: roomCode, profile: userProfile });
    showCallPage();
});

function createParticipantElement(userId, profileImage) {
    const participantDiv = document.createElement('div');
    participantDiv.className = 'participant';
    participantDiv.id = `participant-${userId}`;
    
    const img = document.createElement('img');
    img.src = profileImage;
    img.alt = 'Participant';
    
    const muteIndicator = document.createElement('div');
    muteIndicator.className = 'mute-indicator';
    muteIndicator.style.display = 'none';
    muteIndicator.innerHTML = '<i class="fas fa-microphone-slash"></i>';
    
    participantDiv.appendChild(img);
    participantDiv.appendChild(muteIndicator);
    participantsGrid.appendChild(participantDiv);
}

function showCallPage() {
    landingPage.style.display = 'none';
    callPage.style.display = 'block';
    createParticipantElement('local', userProfile.image);
    startCall();
}

function startCall() {
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then((stream) => {
            localStream = stream;
            peerConnection = new RTCPeerConnection(iceServers);

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

            setupCallEventHandlers();
        })
        .catch((error) => {
            console.error('Error accessing media devices:', error);
            alert('Unable to access microphone. Please check permissions.');
        });
}

function setupCallEventHandlers() {
    socket.on('user-joined', ({ id, profile }) => {
        isCallConnected = true;
        createParticipantElement(id, profile.image);
        showNotification('Call connected! You can now talk.');
        createAndSendOffer();
    });

    socket.on('user-left', ({ id }) => {
        const participantEl = document.getElementById(`participant-${id}`);
        if (participantEl) {
            participantEl.remove();
        }
        showNotification('Other participant left the call');
    });

    socket.on('offer', async ({ offer }) => {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', { answer, room: currentRoom });
    });

    socket.on('answer', async ({ answer }) => {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on('new-ice-candidate', async ({ candidate }) => {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.error('Error adding ice candidate:', e);
        }
    });
}

function createAndSendOffer() {
    peerConnection.createOffer()
        .then((offer) => {
            return peerConnection.setLocalDescription(offer);
        })
        .then(() => {
            socket.emit('offer', { 
                offer: peerConnection.localDescription, 
                room: currentRoom 
            });
        })
        .catch(error => {
            console.error('Error creating offer:', error);
        });
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.id = 'call-notification';
    notification.textContent = message;
    notification.className = 'show';
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// Call controls
muteBtn.addEventListener('click', () => {
    const audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    muteBtn.querySelector('i').classList.toggle('fa-microphone-slash');
    muteBtn.querySelector('i').classList.toggle('fa-microphone');
    
    const localParticipant = document.getElementById('participant-local');
    if (localParticipant) {
        const muteIndicator = localParticipant.querySelector('.mute-indicator');
        muteIndicator.style.display = audioTrack.enabled ? 'none' : 'flex';
    }
    
    socket.emit('user-mute', { 
        room: currentRoom, 
        isMuted: !audioTrack.enabled 
    });
});

hangupBtn.addEventListener('click', () => {
    if (currentRoom) {
        socket.emit('leave-call', currentRoom);
    }
    terminateCall();
});

function terminateCall() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    participantsGrid.innerHTML = '';
    const audioElements = document.querySelectorAll('audio');
    audioElements.forEach(audio => audio.remove());
    
    landingPage.style.display = 'block';
    callPage.style.display = 'none';
    currentRoom = null;
    isCallConnected = false;
}