const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Rooms data structure with enhanced management
const rooms = new Map();

// Logging middleware
const log = (message) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
};

io.on('connection', (socket) => {
    log(`New user connected: ${socket.id}`);

    socket.on('create-room', (room) => {
        if (!rooms.has(room)) {
            rooms.set(room, {
                members: new Set(),
                muteStatus: {},
                speakerStatus: {}
            });
        }
        const roomData = rooms.get(room);
        roomData.members.add(socket.id);
        socket.join(room);
        log(`Room ${room} created by ${socket.id}`);
        socket.emit('room-created', room);
    });

    socket.on('join-room', (room) => {
        if (rooms.has(room)) {
            const roomData = rooms.get(room);
            roomData.members.add(socket.id);
            socket.join(room);
            
            // Notify ALL users in the room that someone joined
            io.to(room).emit('user-joined', { id: socket.id });
            
            // Send current status to the newly joined user
            if (roomData.muteStatus[socket.id] !== undefined) {
                socket.emit('other-user-mute', { 
                    isMuted: roomData.muteStatus[socket.id] 
                });
            }
            if (roomData.speakerStatus[socket.id] !== undefined) {
                socket.emit('other-user-speaker', { 
                    isSpeakerOff: roomData.speakerStatus[socket.id] 
                });
            }
            
            log(`User ${socket.id} joined room ${room}`);
        } else {
            socket.emit('error', 'Room does not exist.');
        }
    });

    // WebRTC signaling events
    socket.on('offer', ({ offer, room }) => {
        log(`Offer received in room ${room}`);
        socket.to(room).emit('offer', { offer, id: socket.id });
    });

    socket.on('answer', ({ answer, room }) => {
        log(`Answer received in room ${room}`);
        socket.to(room).emit('answer', { answer, id: socket.id });
    });

    socket.on('new-ice-candidate', ({ candidate, room }) => {
        log(`ICE Candidate received in room ${room}`);
        socket.to(room).emit('new-ice-candidate', { candidate, id: socket.id });
    });

    // Updated handlers for user mute and speaker events
    socket.on('user-mute', ({ room, isMuted }) => {
        log(`User ${socket.id} mute status: ${isMuted}`);
        
        // Update room's mute status
        const roomData = rooms.get(room);
        if (roomData) {
            roomData.muteStatus[socket.id] = isMuted;
            
            // Broadcast to all other users in the room
            socket.to(room).emit('other-user-mute', { isMuted });
        }
    });

    socket.on('user-speaker', ({ room, isSpeakerOff }) => {
        log(`User ${socket.id} speaker status: ${isSpeakerOff}`);
        
        // Update room's speaker status
        const roomData = rooms.get(room);
        if (roomData) {
            roomData.speakerStatus[socket.id] = isSpeakerOff;
            
            // Broadcast to all other users in the room
            socket.to(room).emit('other-user-speaker', { isSpeakerOff });
        }
    });

    // Handle user leaving the call
    socket.on('leave-call', (room) => {
        // Broadcast to all other users in the room that someone left
        socket.to(room).emit('call-ended');
        log(`User ${socket.id} left room ${room}`);
        
        // Clean up user's status in the room
        const roomData = rooms.get(room);
        if (roomData) {
            delete roomData.muteStatus[socket.id];
            delete roomData.speakerStatus[socket.id];
        }
    });

    // Disconnect handling
    socket.on('disconnect', () => {
        log(`User ${socket.id} disconnected`);
        for (const [room, roomData] of rooms.entries()) {
            if (roomData.members.has(socket.id)) {
                roomData.members.delete(socket.id);
                socket.to(room).emit('user-left', { id: socket.id });
                
                // Clean up user's status
                delete roomData.muteStatus[socket.id];
                delete roomData.speakerStatus[socket.id];
                
                if (roomData.members.size === 0) {
                    rooms.delete(room);
                }
                break;
            }
        }
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    log(`Error: ${err.message}`);
    res.status(500).send('Something went wrong!');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    log(`Server running on port ${PORT}`);
});