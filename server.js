const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const winston = require('winston');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { v4: uuidv4 } = require('uuid');

class ServerLogger {
    constructor() {
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.splat(),
                winston.format.json()
            ),
            transports: [
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.simple()
                    )
                }),
                new winston.transports.File({ 
                    filename: 'error.log', 
                    level: 'error' 
                }),
                new winston.transports.File({ 
                    filename: 'combined.log' 
                })
            ]
        });
    }

    info(message, meta = {}) {
        this.logger.info(message, meta);
    }

    error(message, meta = {}) {
        this.logger.error(message, meta);
    }

    warn(message, meta = {}) {
        this.logger.warn(message, meta);
    }
}

class RoomManager {
    constructor(logger) {
        this.logger = logger;
        this.rooms = new Map();
        this.MAX_ROOM_MEMBERS = 2;
        this.ROOM_TTL = 24 * 60 * 60 * 1000; // 24 hours
    }

    createRoom(roomCode, creatorId) {
        if (this.rooms.has(roomCode)) {
            return false;
        }

        this.rooms.set(roomCode, {
            creator: creatorId,
            createdAt: Date.now(),
            members: [creatorId]
        });

        this.logger.info(`Room created`, { roomCode, creatorId });
        return true;
    }

    joinRoom(roomCode, memberId) {
        const room = this.rooms.get(roomCode);
        
        if (!room || room.members.length >= this.MAX_ROOM_MEMBERS) {
            return false;
        }

        room.members.push(memberId);
        this.logger.info(`Member joined room`, { roomCode, memberId });
        return true;
    }

    leaveRoom(roomCode, memberId) {
        const room = this.rooms.get(roomCode);
        
        if (!room) {
            return false;
        }

        room.members = room.members.filter(id => id !== memberId);

        if (room.members.length === 0) {
            this.rooms.delete(roomCode);
            this.logger.info(`Room deleted`, { roomCode });
            return true;
        }

        this.logger.info(`Member left room`, { roomCode, memberId });
        return false;
    }

    getRoomMembers(roomCode) {
        const room = this.rooms.get(roomCode);
        return room ? room.members : [];
    }

    cleanupZombieRooms() {
        const now = Date.now();

        for (const [roomCode, room] of this.rooms.entries()) {
            if (!room.members.length || 
                now - room.createdAt > this.ROOM_TTL) {
                this.rooms.delete(roomCode);
                this.logger.info(`Cleaned up zombie room`, { roomCode });
            }
        }
    }
}

class WebRTCServer {
    constructor() {
        this.logger = new ServerLogger();
        this.roomManager = new RoomManager(this.logger);

        this.app = express();
        this.server = http.createServer(this.app);
        this.io = new Server(this.server, {
            cors: {
                origin: process.env.ALLOWED_ORIGINS || '*',
                methods: ['GET', 'POST']
            }
        });

        this.configureMiddleware();
        this.setupSocketEvents();
        this.setupPeriodicCleanup();
    }

    configureMiddleware() {
        // Security Middleware
        this.app.use(helmet());

        // Rate Limiting
        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100, // Limit each IP to 100 requests per windowMs
            standardHeaders: true,
            legacyHeaders: false,
            handler: (req, res) => {
                this.logger.warn('Rate limit exceeded', { 
                    ip: req.ip 
                });
                res.status(429).json({
                    error: 'Too many requests, please try again later.'
                });
            }
        });
        this.app.use(limiter);

        // Static file serving
        this.app.use(express.static(path.join(__dirname, 'public'), {
            setHeaders: (res) => {
                res.set('X-Content-Type-Options', 'nosniff');
                res.set('X-Frame-Options', 'DENY');
            }
        }));

        // Advanced error handling
        this.app.use((err, req, res, next) => {
            this.logger.error('Unhandled server error', { 
                error: err,
                path: req.path 
            });
            res.status(500).json({
                error: 'Internal server error',
                requestId: uuidv4()
            });
        });
    }

    setupSocketEvents() {
        // Socket middleware for authentication and logging
        this.io.use((socket, next) => {
            const clientId = socket.handshake.query.clientId;
            
            if (!clientId) {
                return next(new Error('Invalid client credentials'));
            }

            socket.clientId = clientId;
            this.logger.info('Socket connection authenticated', { 
                socketId: socket.id, 
                clientId 
            });
            next();
        });

        this.io.on('connection', (socket) => {
            this.logger.info('New socket connection', { 
                socketId: socket.id 
            });

            socket.on('create-room', async (roomCode) => {
                try {
                    const created = this.roomManager.createRoom(roomCode, socket.id);
                    if (created) {
                        socket.join(roomCode);
                        socket.emit('room-created', roomCode);
                    } else {
                        socket.emit('error', 'Room creation failed');
                    }
                } catch (error) {
                    this.logger.error('Room creation error', { error });
                }
            });

            socket.on('join-room', async (roomCode) => {
                try {
                    const joined = this.roomManager.joinRoom(roomCode, socket.id);
                    if (joined) {
                        socket.join(roomCode);
                        this.io.to(roomCode).emit('user-joined', { 
                            id: socket.id 
                        });
                    } else {
                        socket.emit('error', 'Cannot join room');
                    }
                } catch (error) {
                    this.logger.error('Room join error', { error });
                }
            });

            // WebRTC Signaling Events
            ['offer', 'answer', 'new-ice-candidate'].forEach(event => {
                socket.on(event, (data) => {
                    this.logger.info(`WebRTC event`, { 
                        event, 
                        roomCode: data.room 
                    });
                    socket.to(data.room).emit(event, data);
                });
            });

            socket.on('disconnect', async () => {
                try {
                    const rooms = Array.from(socket.rooms);
                    for (const roomCode of rooms) {
                        if (roomCode !== socket.id) {
                            this.roomManager.leaveRoom(roomCode, socket.id);
                            socket.to(roomCode).emit('user-left', { 
                                id: socket.id 
                            });
                        }
                    }
                } catch (error) {
                    this.logger.error('Disconnect handling error', { error });
                }
            });
        });
    }

    setupPeriodicCleanup() {
        // Clean up zombie rooms every hour
        setInterval(() => {
            this.roomManager.cleanupZombieRooms();
        }, 60 * 60 * 1000);
    }

    start(port = process.env.PORT || 3000) {
        this.server.listen(port, () => {
            this.logger.info(`Server running on port ${port}`, { 
                environment: process.env.NODE_ENV || 'development' 
            });
        });
    }
}

// Initialize and start the server
const webrtcServer = new WebRTCServer();
webrtcServer.start();

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully');
    webrtcServer.server.close(() => {
        console.log('Process terminated');
        process.exit(0);
    });
});