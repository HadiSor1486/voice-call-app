const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Enhanced room management with metadata
class RoomManager {
    constructor() {
        this.rooms = new Map();
        this.userToRoom = new Map();
        this.ROOM_TIMEOUT = 5 * 60 * 1000; // 5 minutes
        this.MAX_USERS_PER_ROOM = 2;
        
        // Start periodic cleanup
        setInterval(() => this.cleanupInactiveRooms(), 60 * 1000); // Check every minute
    }

    createRoom(roomId, creatorId) {
        const room = {
            id: roomId,
            users: new Set([creatorId]),
            createdAt: Date.now(),
            lastActivity: Date.now(),
            creator: creatorId
        };
        this.rooms.set(roomId, room);
        this.userToRoom.set(creatorId, roomId);
        return room;
    }

    joinRoom(roomId, userId) {
        const room = this.rooms.get(roomId);
        if (!room) return null;
        if (room.users.size >= this.MAX_USERS_PER_ROOM) return 'full';
        
        room.users.add(userId);
        room.lastActivity = Date.now();
        this.userToRoom.set(userId, roomId);
        return room;
    }

    leaveRoom(userId) {
        const roomId = this.userToRoom.get(userId);
        if (!roomId) return;

        const room = this.rooms.get(roomId);
        if (room) {
            room.users.delete(userId);
            if (room.users.size === 0) {
                this.rooms.delete(roomId);
            }
        }
        this.userToRoom.delete(userId);
    }

    updateActivity(roomId) {
        const room = this.rooms.get(roomId);
        if (room) {
            room.lastActivity = Date.now();
        }
    }

    cleanupInactiveRooms() {
        const now = Date.now();
        for (const [roomId, room] of this.rooms.entries()) {
            if (now - room.lastActivity > this.ROOM_TIMEOUT) {
                // Notify users in the room before deletion
                io.to(roomId).emit('room-timeout');
                
                // Clean up user mappings
                room.users.forEach(userId => {
                    this.userToRoom.delete(userId);
                });
                
                this.rooms.delete(roomId);
                log(`Cleaned up inactive room: ${roomId}`);
            }
        }
    }

    getRoomInfo(roomId) {
        return this.rooms.get(roomId);
    }

    isUserInRoom(userId) {
        return this.userToRoom.has(userId);
    }
}

const roomManager = new RoomManager();

// Enhanced logging with levels
const log = (message, level = 'info') => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    console.log(logMessage);
    
    // You could also implement file logging here
};

io.on('connection', (socket) => {
    log(`New user connected: ${socket.id}`);

    socket.on('create-room', (room) => {
        try {
            if (roomManager.isUserInRoom(socket.id)) {
                socket.emit('error', 'You are already in a room');
                return;
            }

            const newRoom = roomManager.createRoom(room, socket.id);
            socket.join(room);
            socket.emit('room-created', room);
            log(`Room ${room} created by ${socket.id}`);
        } catch (error) {
            log(`Error creating room: ${error.message}`, 'error');
            socket.emit('error', 'Failed to create room');
        }
    });

    socket.on('join-room', (room) => {
        try {
            if (roomManager.isUserInRoom(socket.id)) {
                socket.emit('error', 'You are already in a room');
                return;
            }

            const result = roomManager.joinRoom(room, socket.id);
            if (!result) {
                socket.emit('error', 'Room does not exist');
                return;
            }
            if (result === 'full') {
                socket.emit('error', 'Room is full');
                return;
            }

            socket.join(room);
            io.to(room).emit('user-joined', { id: socket.id });
            log(`User ${socket.id} joined room ${room}`);
        } catch (error) {
            log(`Error joining room: ${error.message}`, 'error');
            socket.emit('error', 'Failed to join room');
        }
    });

    // WebRTC signaling with error handling
    socket.on('offer', ({ offer, room }) => {
        try {
            roomManager.updateActivity(room);
            socket.to(room).emit('offer', { offer, id: socket.id });
            log(`Offer sent in room ${room}`);
        } catch (error) {
            log(`Error sending offer: ${error.message}`, 'error');
        }
    });

    socket.on('answer', ({ answer, room }) => {
        try {
            roomManager.updateActivity(room);
            socket.to(room).emit('answer', { answer, id: socket.id });
            log(`Answer sent in room ${room}`);
        } catch (error) {
            log(`Error sending answer: ${error.message}`, 'error');
        }
    });

    socket.on('new-ice-candidate', ({ candidate, room }) => {
        try {
            roomManager.updateActivity(room);
            socket.to(room).emit('new-ice-candidate', { candidate, id: socket.id });
        } catch (error) {
            log(`Error sending ICE candidate: ${error.message}`, 'error');
        }
    });

    // Enhanced status events with error handling
    socket.on('user-mute', ({ room, isMuted }) => {
        try {
            roomManager.updateActivity(room);
            socket.to(room).emit('other-user-mute', { isMuted });
            log(`User ${socket.id} mute status: ${isMuted}`);
        } catch (error) {
            log(`Error updating mute status: ${error.message}`, 'error');
        }
    });

    socket.on('user-speaker', ({ room, isSpeakerOff }) => {
        try {
            roomManager.updateActivity(room);
            socket.to(room).emit('other-user-speaker', { isSpeakerOff });
            log(`User ${socket.id} speaker status: ${isSpeakerOff}`);
        } catch (error) {
            log(`Error updating speaker status: ${error.message}`, 'error');
        }
    });

    socket.on('leave-call', (room) => {
        try {
            socket.to(room).emit('call-ended');
            roomManager.leaveRoom(socket.id);
            socket.leave(room);
            log(`User ${socket.id} left room ${room}`);
        } catch (error) {
            log(`Error leaving call: ${error.message}`, 'error');
        }
    });

    socket.on('disconnect', () => {
        try {
            const roomId = roomManager.userToRoom.get(socket.id);
            if (roomId) {
                socket.to(roomId).emit('user-left', { id: socket.id });
                roomManager.leaveRoom(socket.id);
            }
            log(`User ${socket.id} disconnected`);
        } catch (error) {
            log(`Error handling disconnect: ${error.message}`, 'error');
        }
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    log(`Server error: ${err.message}`, 'error');
    res.status(500).send('Something went wrong!');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    log(`Server running on port ${PORT}`);
});