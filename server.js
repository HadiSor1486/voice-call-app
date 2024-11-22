const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

io.on('connection', (socket) => {
    console.log(`New user connected: ${socket.id}`);

    socket.on('create-room', ({ room, profile }) => {
        if (!rooms.has(room)) {
            rooms.set(room, new Map());
            const roomUsers = rooms.get(room);
            roomUsers.set(socket.id, { profile });
            socket.join(room);
            console.log(`Room ${room} created by ${socket.id}`);
            socket.emit('room-created', room);
        }
    });

    socket.on('join-room', ({ room, profile }) => {
        if (rooms.has(room)) {
            const roomUsers = rooms.get(room);
            roomUsers.set(socket.id, { profile });
            socket.join(room);
            
            // Send joined user's profile to existing users
            socket.to(room).emit('user-joined', { 
                id: socket.id,
                profile 
            });
            
            // Send existing users' profiles to joined user
            roomUsers.forEach((userData, userId) => {
                if (userId !== socket.id) {
                    socket.emit('user-joined', {
                        id: userId,
                        profile: userData.profile
                    });
                }
            });
            
            console.log(`User ${socket.id} joined room ${room}`);
        } else {
            socket.emit('error', 'Room does not exist');
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

    socket.on('user-mute', ({ room, isMuted }) => {
        socket.to(room).emit('other-user-mute', { id: socket.id, isMuted });
    });

    socket.on('leave-call', (room) => {
        handleUserLeaving(socket, room);
    });

    socket.on('disconnect', () => {
        console.log(`User ${socket.id} disconnected`);
        rooms.forEach((users, room) => {
            if (users.has(socket.id)) {
                handleUserLeaving(socket, room);
            }
        });
    });
});

function handleUserLeaving(socket, room) {
    if (rooms.has(room)) {
        const roomUsers = rooms.get(room);
        roomUsers.delete(socket.id);
        socket.to(room).emit('user-left', { id: socket.id });
        
        if (roomUsers.size === 0) {
            rooms.delete(room);
            console.log(`Room ${room} deleted - no users left`);
        }
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});