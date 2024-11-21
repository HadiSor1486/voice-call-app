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
            rooms.set(room, new Set());
        }
        const roomMembers = rooms.get(room);
        roomMembers.add(socket.id);
        socket.join(room);
        log(`Room ${room} created by ${socket.id}`);
        socket.emit('room-created', room);
    });

    socket.on('join-room', (room) => {
        if (rooms.has(room)) {
            const roomMembers = rooms.get(room);
            roomMembers.add(socket.id);
            socket.join(room);
            // Notify ALL users in the room (including the joining user) that someone joined
            io.to(room).emit('user-joined', { id: socket.id });
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

    // Handle user leaving the call
    socket.on('leave-call', (room) => {
        // Broadcast to all other users in the room that someone left
        socket.to(room).emit('call-ended');
        log(`User ${socket.id} left room ${room}`);
    });

    // Disconnect handling
    socket.on('disconnect', () => {
        log(`User ${socket.id} disconnected`);
        for (const [room, members] of rooms.entries()) {
            if (members.has(socket.id)) {
                members.delete(socket.id);
                socket.to(room).emit('user-left', { id: socket.id });
                
                if (members.size === 0) {
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