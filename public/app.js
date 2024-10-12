const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidV4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public')); // Assuming your static files (HTML, CSS, JS) are in a 'public' folder

// Serve index.html as the default file
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Handle connection via Socket.IO
io.on('connection', socket => {
    console.log('New user connected:', socket.id);

    // When a user creates a room
    socket.on('createRoom', (roomId) => {
        socket.join(roomId);
        console.log(`User ${socket.id} created and joined room ${roomId}`);
    });

    // When a user joins an existing room
    socket.on('joinRoom', (roomId) => {
        if (io.sockets.adapter.rooms.has(roomId)) {
            socket.join(roomId);
            console.log(`User ${socket.id} joined room ${roomId}`);
            socket.to(roomId).emit('user-joined', socket.id); // Notify others in the room
        } else {
            socket.emit('error', 'Room not found');
            console.log(`User ${socket.id} tried to join non-existing room ${roomId}`);
        }
    });

    // Handle ICE candidates (for WebRTC connections)
    socket.on('new-ice-candidate', (candidate, roomId) => {
        socket.to(roomId).emit('new-ice-candidate', candidate);
    });

    // Handle WebRTC offer
    socket.on('offer', (offer, roomId) => {
        socket.to(roomId).emit('offer', offer);
    });

    // Handle WebRTC answer
    socket.on('answer', (answer, roomId) => {
        socket.to(roomId).emit('answer', answer);
    });

    // Handle when a user leaves the room
    socket.on('disconnect', () => {
        io.emit('user-left', socket.id);
        console.log(`User ${socket.id} disconnected`);
    });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
