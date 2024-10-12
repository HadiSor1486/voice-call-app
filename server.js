const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

// Create an Express app
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Serve static files (HTML, JS)
app.use(express.static('public'));

const rooms = {}; // Store rooms and their participants

// Listen for WebSocket connections
io.on('connection', (socket) => {
    console.log('New user connected:', socket.id);

    socket.on('create-room', (roomCode) => {
        rooms[roomCode] = [socket.id]; // Add the host to the room
        socket.join(roomCode); // Join the room
        console.log(`Room ${roomCode} created by ${socket.id}`);
    });

    socket.on('join-room', (roomCode) => {
        if (rooms[roomCode]) {
            rooms[roomCode].push(socket.id); // Add new participant to the room
            socket.join(roomCode); // Join the room
            socket.to(roomCode).emit('user-joined'); // Notify other users in the room
            console.log(`${socket.id} joined room ${roomCode}`);
        } else {
            socket.emit('error', 'Room does not exist.');
        }
    });

    socket.on('offer', (offer) => {
        const room = Object.keys(rooms).find((key) => rooms[key].includes(socket.id));
        if (room) {
            socket.to(room).emit('offer', offer);
        }
    });

    socket.on('answer', (answer) => {
        const room = Object.keys(rooms).find((key) => rooms[key].includes(socket.id));
        if (room) {
            socket.to(room).emit('answer', answer);
        }
    });

    socket.on('new-ice-candidate', (candidate) => {
        const room = Object.keys(rooms).find((key) => rooms[key].includes(socket.id));
        if (room) {
            socket.to(room).emit('new-ice-candidate', candidate);
        }
    });

    socket.on('disconnect', () => {
        console.log(`${socket.id} disconnected`);
        
        // Remove the socket from any room it's in
        for (const roomCode in rooms) {
            const index = rooms[roomCode].indexOf(socket.id);
            if (index !== -1) {
                rooms[roomCode].splice(index, 1); // Remove the socket from the room
                socket.to(roomCode).emit('user-left'); // Notify other users
                if (rooms[roomCode].length === 0) {
                    delete rooms[roomCode]; // Remove the room if empty
                }
                break;
            }
        }
    });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
