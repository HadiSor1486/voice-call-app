const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static('public'));

let rooms = {};  // Store rooms and participants

// Handle WebSocket connections
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
        } else {
            socket.emit('error', 'Room does not exist.');
        }
    });

    socket.on('disconnect', () => {
        // Remove the user from any rooms and update participants
        for (const roomCode in rooms) {
            rooms[roomCode] = rooms[roomCode].filter(user => user.id !== socket.id);
            if (rooms[roomCode].length === 0) delete rooms[roomCode];
            else io.to(roomCode).emit('participants-update', rooms[roomCode]);
        }
        console.log('User disconnected:', socket.id);
    });
});

// Use Render's PORT environment variable or default to 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
