const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public')); // Serve static files from the 'public' directory

let activeRooms = {};

// Handle new connections from clients
io.on('connection', (socket) => {
    console.log('New client connected', socket.id);

    // Create a room
    socket.on('create-room', (roomCode) => {
        if (!activeRooms[roomCode]) {
            activeRooms[roomCode] = [];
        }
        activeRooms[roomCode].push(socket.id);
        socket.join(roomCode);
        console.log(`Room ${roomCode} created with user ${socket.id}`);
    });

    // Join an existing room
    socket.on('join-room', (roomCode) => {
        if (activeRooms[roomCode] && activeRooms[roomCode].length < 2) {
            activeRooms[roomCode].push(socket.id);
            socket.join(roomCode);
            io.to(roomCode).emit('call-started');
            console.log(`User ${socket.id} joined room ${roomCode}`);
        } else {
            socket.emit('room-full');
            console.log(`Room ${roomCode} is full or doesn't exist.`);
        }
    });

    // Handle offer, answer, and ICE candidates for WebRTC signaling
    socket.on('offer', (offer) => {
        const roomCode = Object.keys(socket.rooms)[1]; // Get the room the user is in
        socket.to(roomCode).emit('offer', offer);
    });

    socket.on('answer', (answer) => {
        const roomCode = Object.keys(socket.rooms)[1];
        socket.to(roomCode).emit('answer', answer);
    });

    socket.on('new-ice-candidate', (candidate) => {
        const roomCode = Object.keys(socket.rooms)[1];
        socket.to(roomCode).emit('new-ice-candidate', candidate);
    });

    // Handle call end
    socket.on('leave-call', () => {
        const roomCode = Object.keys(socket.rooms)[1];
        socket.to(roomCode).emit('call-ended');
        console.log(`User ${socket.id} left the room ${roomCode}`);
        socket.leave(roomCode);
        activeRooms[roomCode] = activeRooms[roomCode].filter((id) => id !== socket.id);
        if (activeRooms[roomCode].length === 0) {
            delete activeRooms[roomCode];
        }
    });

    // Handle client disconnect
    socket.on('disconnect', () => {
        console.log('Client disconnected', socket.id);
        for (let roomCode in activeRooms) {
            activeRooms[roomCode] = activeRooms[roomCode].filter((id) => id !== socket.id);
            if (activeRooms[roomCode].length === 0) {
                delete activeRooms[roomCode];
            }
        }
    });
});

// Set up the server to listen on a port
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
