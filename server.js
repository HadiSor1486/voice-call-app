const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

// Set up the Express app
const app = express();
const server = http.createServer(app);  // Create the HTTP server

// Initialize Socket.IO with the HTTP server
const io = socketIo(server);

const rooms = {};  // Store participants in rooms

io.on('connection', (socket) => {
    console.log('New user connected:', socket.id);

    socket.on('create-room', ({ roomCode, username }) => {
        rooms[roomCode] = rooms[roomCode] || [];
        rooms[roomCode].push({ id: socket.id, username });
        socket.join(roomCode);
        io.to(roomCode).emit('participants-update', rooms[roomCode]);
    });

    socket.on('join-room', ({ roomCode, username }) => {
        if (rooms[roomCode]) {
            rooms[roomCode].push({ id: socket.id, username });
            socket.join(roomCode);
            io.to(roomCode).emit('participants-update', rooms[roomCode]);
            socket.to(roomCode).emit('new-participant', socket.id);
        } else {
            socket.emit('error', 'Room does not exist.');
        }
    });

    socket.on('offer', ({ offer, to }) => {
        io.to(to).emit('offer', { offer, from: socket.id });
    });

    socket.on('answer', ({ answer, to }) => {
        io.to(to).emit('answer', { answer, from: socket.id });
    });

    socket.on('new-ice-candidate', ({ candidate, to }) => {
        io.to(to).emit('new-ice-candidate', { candidate, from: socket.id });
    });

    socket.on('disconnect', () => {
        for (const roomCode in rooms) {
            rooms[roomCode] = rooms[roomCode].filter(user => user.id !== socket.id);
            if (rooms[roomCode].length === 0) {
                delete rooms[roomCode];
            } else {
                io.to(roomCode).emit('participants-update', rooms[roomCode]);
            }
        }
    });
});

// Serve the frontend (index.html, etc.)
app.use(express.static('public'));

// Listen on the specified port
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
