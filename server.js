const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

let rooms = {};

app.use(express.static('public'));

// Handle room creation
io.on('connection', (socket) => {
    socket.on('create-room', (roomCode) => {
        rooms[roomCode] = { host: socket.id, users: [socket.id] };
        socket.emit('room-created', roomCode);
    });

    // Handle room joining
    socket.on('join-room', (roomCode) => {
        if (!rooms[roomCode]) {
            socket.emit('error', 'Room not found');
            return;
        }
        rooms[roomCode].users.push(socket.id);
        socket.join(roomCode);
        io.to(roomCode).emit('room-joined');
    });

    // Handle signaling messages
    socket.on('call', (data) => {
        const room = rooms[data.room];
        if (!room) return;
        room.users.forEach(userId => {
            if (userId !== socket.id) {
                io.to(userId).emit('call-on');
            }
        });
    });

    // Handle ICE candidate
    socket.on('new-ice-candidate', (data) => {
        io.to(data.room).emit('new-ice-candidate', data);
    });

    // Handle hangup
    socket.on('hangup', (roomCode) => {
        io.to(roomCode).emit('hangup');
        socket.leave(roomCode);
    });

    socket.on('disconnect', () => {
        // Handle user disconnect
    });
});

server.listen(3000, () => {
    console.log('Server running on port 3000');
});
