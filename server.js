const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const rooms = {}; // Store rooms and their participants

app.use(express.static('public')); // Serve static files from public directory

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Handle creating a room
    socket.on('create-room', ({ roomCode, username }) => {
        if (!rooms[roomCode]) {
            rooms[roomCode] = { participants: [] };
        }

        if (rooms[roomCode].participants.length < 2) {
            rooms[roomCode].participants.push({ id: socket.id, username });
            socket.join(roomCode);
            io.to(roomCode).emit('participants-update', rooms[roomCode].participants);
        } else {
            socket.emit('room-full', { message: 'Room is full. Please try another room.' });
        }
    });

    // Handle joining a room
    socket.on('join-room', ({ roomCode, username }) => {
        if (rooms[roomCode]) {
            if (rooms[roomCode].participants.length < 2) {
                rooms[roomCode].participants.push({ id: socket.id, username });
                socket.join(roomCode);
                io.to(roomCode).emit('participants-update', rooms[roomCode].participants);
                socket.emit('joined', { message: 'You joined the room successfully.' });
            } else {
                socket.emit('room-full', { message: 'Room is full. Please try another room.' });
            }
        } else {
            socket.emit('room-not-found', { message: 'Room not found. Please check the code.' });
        }
    });

    // Handle ready signal
    socket.on('ready', () => {
        const roomsJoined = Object.keys(rooms);
        for (const roomCode of roomsJoined) {
            const room = rooms[roomCode];
            if (room.participants.length === 2) {
                const otherParticipant = room.participants.find(p => p.id !== socket.id);
                if (otherParticipant) {
                    io.to(otherParticipant.id).emit('user-joined', { username: otherParticipant.username });
                }
            }
        }
    });

    // Handle ICE candidates
    socket.on('new-ice-candidate', ({ candidate, to }) => {
        socket.to(to).emit('new-ice-candidate', candidate);
    });

    // Handle offer and answer
    socket.on('offer', ({ offer, to }) => {
        socket.to(to).emit('offer', { offer, from: socket.id });
    });

    socket.on('answer', ({ answer, to }) => {
        socket.to(to).emit('answer', answer);
    });

    // Handle user disconnect
    socket.on('disconnect', () => {
        console.log('A user disconnected:', socket.id);
        // Remove user from all rooms they were in
        for (const roomCode in rooms) {
            rooms[roomCode].participants = rooms[roomCode].participants.filter(p => p.id !== socket.id);
            io.to(roomCode).emit('participants-update', rooms[roomCode].participants);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
