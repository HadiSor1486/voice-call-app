const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.ALLOWED_ORIGINS || "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000 // Increased timeout for stable connections
});

// Enhanced logging utility
const log = (message, level = 'info') => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
};

// Advanced Room Management
class RoomManager {
    constructor() {
        this.rooms = new Map();
        this.ROOM_TIMEOUT = 15 * 60 * 1000; // 15 minutes
        this.MAX_USERS_PER_ROOM = 2;
    }

    createRoom(roomId, creatorId) {
        if (this.rooms.has(roomId)) {
            throw new Error('Room already exists');
        }

        const room = {
            id: roomId,
            users: new Map(), // Use Map to store user details
            createdAt: Date.now(),
            lastActivity: Date.now()
        };

        // Store user with additional metadata
        room.users.set(creatorId, {
            id: creatorId,
            joinedAt: Date.now(),
            mediaStatus: {
                audio: true,
                video: true
            }
        });

        this.rooms.set(roomId, room);
        return room;
    }

    joinRoom(roomId, userId) {
        const room = this.rooms.get(roomId);
        
        if (!room) {
            throw new Error('Room does not exist');
        }

        if (room.users.size >= this.MAX_USERS_PER_ROOM) {
            throw new Error('Room is full');
        }

        // Add user with detailed metadata
        room.users.set(userId, {
            id: userId,
            joinedAt: Date.now(),
            mediaStatus: {
                audio: true,
                video: true
            }
        });

        room.lastActivity = Date.now();
        return room;
    }

    leaveRoom(userId) {
        for (const room of this.rooms.values()) {
            if (room.users.has(userId)) {
                room.users.delete(userId);
                
                if (room.users.size === 0) {
                    this.rooms.delete(room.id);
                }
                
                return room;
            }
        }
        return null;
    }

    updateUserMediaStatus(userId, mediaType, status) {
        for (const room of this.rooms.values()) {
            const user = room.users.get(userId);
            if (user) {
                user.mediaStatus[mediaType] = status;
                return true;
            }
        }
        return false;
    }

    getRoomByUser(userId) {
        for (const room of this.rooms.values()) {
            if (room.users.has(userId)) {
                return room;
            }
        }
        return null;
    }
}

const roomManager = new RoomManager();

// Middleware for serving static files
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// WebRTC Signaling Socket Handlers
io.on('connection', (socket) => {
    log(`New user connected: ${socket.id}`);

    // Room Creation and Management
    socket.on('create-room', (roomId) => {
        try {
            const existingRoom = roomManager.getRoomByUser(socket.id);
            if (existingRoom) {
                socket.emit('error', 'You are already in a room');
                return;
            }

            const newRoom = roomManager.createRoom(roomId, socket.id);
            socket.join(roomId);
            socket.emit('room-created', roomId);
            log(`Room ${roomId} created by ${socket.id}`);
        } catch (error) {
            log(`Room creation error: ${error.message}`, 'error');
            socket.emit('error', error.message);
        }
    });

    // Room Joining
    socket.on('join-room', (roomId) => {
        try {
            const existingRoom = roomManager.getRoomByUser(socket.id);
            if (existingRoom) {
                socket.emit('error', 'You are already in a room');
                return;
            }

            const room = roomManager.joinRoom(roomId, socket.id);
            socket.join(roomId);
            
            // Notify all room participants about new user
            io.in(roomId).emit('user-joined', { 
                id: socket.id, 
                users: Array.from(room.users.keys())
            });

            log(`User ${socket.id} joined room ${roomId}`);
        } catch (error) {
            log(`Room join error: ${error.message}`, 'error');
            socket.emit('error', error.message);
        }
    });

    // WebRTC Signaling Events
    socket.on('offer', ({ offer, room, to }) => {
        socket.to(to).emit('offer', { 
            offer, 
            from: socket.id, 
            room 
        });
    });

    socket.on('answer', ({ answer, room, to }) => {
        socket.to(to).emit('answer', { 
            answer, 
            from: socket.id, 
            room 
        });
    });

    socket.on('new-ice-candidate', ({ candidate, room, to }) => {
        socket.to(to).emit('new-ice-candidate', { 
            candidate, 
            from: socket.id, 
            room 
        });
    });

    // Media Control Events
    socket.on('toggle-media', ({ type, status, room }) => {
        const updated = roomManager.updateUserMediaStatus(socket.id, type, status);
        if (updated) {
            socket.to(room).emit('media-status-changed', {
                userId: socket.id,
                type,
                status
            });
        }
    });

    // Leave Call/Room Handling
    socket.on('leave-call', (room) => {
        socket.to(room).emit('user-left', { id: socket.id });
        roomManager.leaveRoom(socket.id);
        socket.leave(room);
    });

    // Disconnect Handling
    socket.on('disconnect', () => {
        const room = roomManager.getRoomByUser(socket.id);
        if (room) {
            socket.to(room.id).emit('user-left', { id: socket.id });
            roomManager.leaveRoom(socket.id);
        }
        log(`User ${socket.id} disconnected`);
    });
});

// Global error handling
process.on('unhandledRejection', (reason, promise) => {
    log(`Unhandled Rejection: ${reason}`, 'error');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    log(`Server running on port ${PORT}`);
});