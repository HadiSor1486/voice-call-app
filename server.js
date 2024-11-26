const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const winston = require('winston');
const Redis = require('ioredis');
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

class InMemoryRoomManager {
    constructor(logger) {
        this.logger = logger;
        this.rooms = new Map();
        this.ROOM_TTL = 24 * 60 * 60; // 24 hours
        this.MAX_ROOM_MEMBERS = 2;
    }

    createRoom(roomCode, creatorId) {
        try {
            // Check if room already exists
            if (this.rooms.has(roomCode)) {
                return false;
            }

            // Create room with initial member
            this.rooms.set(roomCode, {
                creator: creatorId,
                createdAt: Date.now(),
                members: [creatorId]
            });

            this.logger.info(`Room created`, { roomCode, creatorId });
            
            // Set timeout to delete room after TTL
            setTimeout(() => {
                this.rooms.delete(roomCode);
            }, this.ROOM_TTL * 1000);

            return true;
        } catch (error) {
            this.logger.error(`Error creating room`, { error, roomCode });
            return false;
        }
    }

    joinRoom(roomCode, memberId) {
        try {
            const room = this.rooms.get(roomCode);
            
            if (!room || room.members.length >= this.MAX_ROOM_MEMBERS) {
                return false;
            }

            room.members.push(memberId);
            this.logger.info(`Member joined room`, { roomCode, memberId });
            return true;
        } catch (error) {
            this.logger.error(`Error joining room`, { error, roomCode });
            return false;
        }
    }

    leaveRoom(roomCode, memberId) {
        try {
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
        } catch (error) {
            this.logger.error(`Error leaving room`, { error, roomCode });
            return false;
        }
    }

    getRoomMembers(roomCode) {
        try {
            const room = this.rooms.get(roomCode);
            return room ? room.members : [];
        } catch (error) {
            this.logger.error(`Error getting room members`, { error, roomCode });
            return [];
        }
    }

    cleanupZombieRooms() {
        try {
            const now = Date.now();
            for (const [roomCode, room] of this.rooms.entries()) {
                if (now - room.createdAt > this.ROOM_TTL * 1000 || room.members.length === 0) {
                    this.rooms.delete(roomCode);
                    this.logger.info(`Cleaned up zombie room`, { roomCode });
                }
            }
        } catch (error) {
            this.logger.error(`Error cleaning up zombie rooms`, { error });
        }
    }
}

class WebRTCServer {
    constructor() {
        this.logger = new ServerLogger();
        
        // Fallback to in-memory room management if Redis connection fails
        try {
            this.redis = new Redis({
                host: process.env.REDIS_HOST || 'localhost',
                port: process.env.REDIS_PORT || 6379,
                connectTimeout: 5000, // 5 second timeout
                retryStrategy: (times) => {
                    this.logger.warn(`Redis connection attempt ${times}`);
                    // Stop trying after 5 attempts
                    if (times > 5) {
                        this.logger.error('Falling back to in-memory room management');
                        this.roomManager = new InMemoryRoomManager(this.logger);
                        return null;
                    }
                    // Exponential backoff
                    return Math.min(times * 500, 3000);
                }
            });

            // Redis error handling
            this.redis.on('error', (error) => {
                this.logger.error('Redis connection error', { error });
                this.roomManager = new InMemoryRoomManager(this.logger);
            });

            // Use Redis-based room manager if connection succeeds
            this.roomManager = new RoomManager(this.redis, this.logger);
        } catch (error) {
            this.logger.error('Failed to initialize Redis', { error });
            this.roomManager = new InMemoryRoomManager(this.logger);
        }

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

        // Catch-all route
        this.app.get('*', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });

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
                    const created = await this.roomManager.createRoom(roomCode, socket.id);
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
                    const joined = await this.roomManager.joinRoom(roomCode, socket.id);
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
                            await this.roomManager.leaveRoom(roomCode, socket.id);
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
                environment: process.env.NODE_ENV || 'development',
                roomManagerType: this.roomManager.constructor.name
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