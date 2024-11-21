const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files
app.use(express.static('public'));

// Rooms data structure with robust management
const rooms = new Map();

io.on('connection', (socket) => {
    console.log('New user connected:', socket.id);

    socket.on('create-room', (room) => {
        if (!rooms.has(room)) {
            rooms.set(room, new Set());
        }
        const roomParticipants = rooms.get(room);

        if (roomParticipants.size < 2) {
            roomParticipants.add(socket.id);
            socket.join(room);
            console.log(`Room ${room} created by ${socket.id}`);
            socket.emit('room-created', room);
        } else {
            socket.emit('room-error', 'Room is full');
        }
    });

    socket.on('join-room', (room) => {
        if (rooms.has(room)) {
            const roomParticipants = rooms.get(room);

            if (roomParticipants.size < 2) {
                roomParticipants.add(socket.id);
                socket.join(room);
                socket.emit('room-joined', room); // Notify successful join
                socket.to(room).emit('user-joined', { id: socket.id });
                console.log(`User ${socket.id} joined room ${room}`);
            } else {
                socket.emit('room-error', 'Room is full');
            }
        } else {
            socket.emit('room-error', 'Room does not exist');
        }
    });

    socket.on('offer', ({ offer, room }) => {
        socket.to(room).emit('offer', { offer, id: socket.id });
    });

    socket.on('answer', ({ answer, room }) => {
        socket.to(room).emit('answer', { answer, id: socket.id });
    });

    socket.on('new-ice-candidate', ({ candidate, room }) => {
        socket.to(room).emit('new-ice-candidate', { candidate, id: socket.id });
    });

    socket.on('hangup', (room) => {
        socket.to(room).emit('peer-hangup');
        const roomParticipants = rooms.get(room);
        if (roomParticipants) {
            roomParticipants.delete(socket.id);
            if (roomParticipants.size === 0) {
                rooms.delete(room);
            }
        }
    });

    socket.on('disconnect', () => {
        console.log(`User ${socket.id} disconnected`);
        for (const [room, participants] of rooms.entries()) {
            if (participants.has(socket.id)) {
                participants.delete(socket.id);
                socket.to(room).emit('peer-left');
                if (participants.size === 0) {
                    rooms.delete(room);
                }
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
