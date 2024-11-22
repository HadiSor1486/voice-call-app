const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Room management with enhanced participant tracking
const rooms = new Map(); // {roomCode: {participants: Map<userId, {profilePicture, isMuted}>}}

io.on('connection', (socket) => {
    socket.on('create-room', ({ roomCode, profilePicture }) => {
        rooms.set(roomCode, {
            participants: new Map([[socket.id, { profilePicture, isMuted: false }]])
        });
        socket.join(roomCode);
    });

    socket.on('join-room', ({ roomCode, profilePicture }) => {
        const room = rooms.get(roomCode);
        if (!room) {
            socket.emit('error', 'Room does not exist');
            return;
        }

        room.participants.set(socket.id, { profilePicture, isMuted: false });
        socket.join(roomCode);

        // Notify existing participants about the new user
        socket.to(roomCode).emit('user-joined', {
            userId: socket.id,
            profilePicture
        });

        // Send existing participants to the new user
        room.participants.forEach((participant, userId) => {
            if (userId !== socket.id) {
                socket.emit('user-joined', {
                    userId,
                    profilePicture: participant.profilePicture
                });
            }
        });
    });

    // WebRTC signaling
    socket.on('offer', ({ offer, userId, room }) => {
        socket.to(userId).emit('offer', {
            offer,
            userId: socket.id,
            profilePicture: rooms.get(room)?.participants.get(socket.id)?.profilePicture
        });
    });

    socket.on('answer', ({ answer, userId, room }) => {
        socket.to(userId).emit('answer', {
            answer,
            userId: socket.id
        });
    });

    socket.on('ice-candidate', ({ candidate, userId, room }) => {
        socket.to(userId).emit('ice-candidate', {
            candidate,
            userId: socket.id
        });
    });

    socket.on('user-mute', ({ room, isMuted }) => {
        const roomData = rooms.get(room);
        if (roomData && roomData.participants.has(socket.id)) {
            roomData.participants.get(socket.id).isMuted = isMuted;
            socket.to(room).emit('user-mute', {
                userId: socket.id,
                isMuted
            });
        }
    });

    socket.on('disconnect', () => {
        rooms.forEach((room, roomCode) => {
            if (room.participants.has(socket.id)) {
                room.participants.delete(socket.id);
                io.to(roomCode).emit('user-left', { userId: socket.id });
                
                if (room.participants.size === 0) {
                    rooms.delete(roomCode);
                }
            }
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});