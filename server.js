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

class RoomManager {
    constructor(redis, logger) {
        this.redis = redis;
        this.logger = logger;
        this.ROOM_TTL = 24 * 60 * 60; // 24 hours
        this.MAX_ROOM_MEMBERS = 2;
    }

    async createRoom(roomCode, creatorId) {
        try {
            const roomKey = `room:${roomCode}`;
            
            // Check if room already exists
            const existingRoom = await this.redis.exists(roomKey);
            if (existingRoom) {
                return false;
            }

            // Create room with initial member
            await this.redis.hmset(roomKey, {
                'creator': creatorId,
                'createdAt': Date.now(),
                'members': JSON.stringify([creatorId])
            });

            // Set expiration
            await this.redis.expire(roomKey, this.ROOM_TTL);

            this.logger.info(`Room created`, { roomCode, creatorId });
            return true;
        } catch (error) {
            this.logger.error(`Error creating room`, { error, roomCode });
            return false;
        }
    }

    async joinRoom(roomCode, memberId) {
        try {
            const roomKey = `room:${roomCode}`;
            
            // Check room exists and isn't full
            const roomExists = await this.redis.exists(roomKey);
            if (!roomExists) {
                return false;
            }

            const membersJson = await this.redis.hget(roomKey, 'members');
            const members = JSON.parse(membersJson);

            if (members.length >= this.MAX_ROOM_MEMBERS) {
                return false;
            }

            // Add new member
            members.push(memberId);
            await this.redis.hmset(roomKey, {
                'members': JSON.stringify(members)
            });

            this.logger.info(`Member joined room`, { roomCode, memberId });
            return true;
        } catch (error) {
            this.logger.error(`Error joining room`, { error, roomCode });
            return false;
        }
    }

    async leaveRoom(roomCode, memberId) {
        try {
            const roomKey = `room:${roomCode}`;
            
            const membersJson = await this.redis.hget(roomKey, 'members');
            let members = JSON.parse(membersJson);

            members = members.filter(id => id !== memberId);

            if (members.length === 0) {
                await this.redis.del(roomKey);
                this.logger.info(`Room deleted`, { roomCode });
                return true;
            }

            await this.redis.hmset(roomKey, {
                'members': JSON.stringify(members)
            });

            this.logger.info(`Member left room`, { roomCode, memberId });
            return false;
        } catch (error) {
            this.logger.error(`Error leaving room`, { error, roomCode });
            return false;
        }
    }

    async getRoomMembers(roomCode) {
        try {
            const roomKey = `room:${roomCode}`;
            const membersJson = await this.redis.hget(roomKey, 'members');
            return JSON.parse(membersJson) || [];
        } catch (error) {
            this.logger.error(`Error getting room members`, { error, roomCode });
            return [];
        }
    }

    async cleanupZombieRooms() {
        try {
            const keys = await this.redis.keys('room:*');
            const now = Date.now();

            for (const key of keys) {
                const createdAt = await this.redis.hget(key, 'createdAt');
                const membersJson = await this.redis.hget(key, 'members');
                const members = JSON.parse(membersJson);

                // Remove rooms older than 24 hours or with no members
                if (!createdAt || 
                    !members || 
                    members.length === 0 || 
                    now - parseInt(createdAt) > this.ROOM_TTL * 1000) {
                    await this.redis.del(key);
                    this.logger.info(`Cleaned up zombie room`, { key });
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
        this.redis = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: process.env.REDIS_PORT || 6379
        });
        this.roomManager = new RoomManager(this.redis, this.logger);

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