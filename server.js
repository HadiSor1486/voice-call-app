const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

// Create an Express app
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Keep track of rooms and participants
const rooms = {};  // Define the rooms object here

// Serve static files (HTML, JS, etc.)
app.use(express.static('public'));

// WebSocket connection
io.on('connection', (socket) => {
    console.log('New user connected:', socket.id);

    // Handle Create Room
    socket.on('createRoom', (roomCode) => {
        rooms[roomCode] = rooms[roomCode] || [];
        rooms[roomCode].push(socket.id);
        socket.join(roomCode);
        console.log(`Room created: ${roomCode}, Participants: ${rooms[roomCode].length}`);
        io.to(socket.id).emit('roomCreated', roomCode);
    });

    // Handle Join Room
    socket.on('joinRoom', (roomCode, username) => {
        if (rooms[roomCode]) {
            rooms[roomCode].push(socket.id);
            socket.join(roomCode);
            console.log(`${username} joined room ${roomCode}`);
            io.to(roomCode).emit('userJoined', username);  // Notify everyone in the room
        } else {
            io.to(socket.id).emit('error', 'Room does not exist');
        }
    });

    // Handle WebRTC Offer
    socket.on('offer', (offer, roomCode) => {
        socket.to(roomCode).emit('offer', offer);
    });

    // Handle WebRTC Answer
    socket.on('answer', (answer, roomCode) => {
        socket.to(roomCode).emit('answer', answer);
    });

    // Handle ICE Candidate
    socket.on('new-ice-candidate', (candidate, roomCode) => {
        socket.to(roomCode).emit('new-ice-candidate', candidate);
    });

    // Handle Disconnect
    socket.on('disconnect', () => {
        for (let roomCode in rooms) {
            rooms[roomCode] = rooms[roomCode].filter(id => id !== socket.id);
            if (rooms[roomCode].length === 0) {
                delete rooms[roomCode];  // Remove the room if empty
            }
        }
        console.log('User disconnected:', socket.id);
    });
});

// Use Render's PORT environment variable or default to 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
