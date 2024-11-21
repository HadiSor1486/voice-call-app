const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
app.use(express.static('public'));
const server = http.createServer(app);
const io = socketIo(server);

const rooms = new Map(); // Store rooms and their participants

io.on('connection', (socket) => {
    console.log('New client connected');

    socket.on('create-room', (roomCode) => {
        if (!rooms.has(roomCode)) {
            rooms.set(roomCode, []);
            socket.join(roomCode);
            socket.emit('join-successful', roomCode);
        } else {
            socket.emit('room-error', 'Room already exists');
        }
    });

    socket.on('join-room', (roomCode) => {
        if (rooms.has(roomCode)) {
            rooms.get(roomCode).push(socket.id);
            socket.join(roomCode);
            socket.emit('join-successful', roomCode);
            io.to(roomCode).emit('user-joined', { message: 'New participant joined' });
        } else {
            socket.emit('room-error', 'Room does not exist');
        }
    });

    socket.on('offer', (data) => {
        const { offer, room } = data;
        io.to(room).emit('offer', { offer, senderId: socket.id });
    });

    socket.on('answer', (data) => {
        const { answer, room } = data;
        io.to(room).emit('answer', { answer, senderId: socket.id });
    });

    socket.on('new-ice-candidate', (data) => {
        const { candidate, room } = data;
        io.to(room).emit('new-ice-candidate', { candidate, senderId: socket.id });
    });

    socket.on('hangup', (room) => {
        rooms.set(room, []);
        io.to(room).emit('peer-hangup');
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
