const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static('public'));

// Rooms data structure
const rooms = {};

// Handle WebSocket connections
io.on('connection', (socket) => {
    console.log('New user connected:', socket.id);

    // Handle 'create-room' event
    socket.on('create-room', (room) => {
        if (!rooms[room]) {
            rooms[room] = {
                participants: [],
                offer: null
            };
        }
        rooms[room].participants.push(socket.id);
        socket.join(room);
        console.log(`Room ${room} created by ${socket.id}`);
        socket.emit('room-created', room);
    });

    // Handle 'join-room' event
    socket.on('join-room', (room) => {
        if (rooms[room]) {
            if (rooms[room].participants.length < 2) {
                rooms[room].participants.push(socket.id);
                socket.join(room);
                
                // Notify other participants that a new user has joined
                socket.to(room).emit('user-joined', { 
                    id: socket.id, 
                    message: 'Your friend has joined the call!' 
                });
                
                // Send the existing offer to the new participant if available
                if (rooms[room].offer) {
                    socket.emit('existing-offer', rooms[room].offer);
                }
                
                console.log(`User ${socket.id} joined room ${room}`);
            } else {
                socket.emit('room-error', 'Room is full');
            }
        } else {
            socket.emit('room-error', 'Room does not exist');
        }
    });

    // Store WebRTC offers
    socket.on('store-offer', ({ offer, room }) => {
        if (rooms[room]) {
            rooms[room].offer = offer;
        }
    });

    // WebRTC signaling events
    socket.on('offer', ({ offer, room }) => {
        // Store the offer
        if (rooms[room]) {
            rooms[room].offer = offer;
        }
        socket.to(room).emit('offer', { offer, id: socket.id });
    });

    socket.on('answer', ({ answer, room }) => {
        socket.to(room).emit('answer', { answer, id: socket.id });
    });

    socket.on('new-ice-candidate', ({ candidate, room }) => {
        socket.to(room).emit('new-ice-candidate', { candidate, id: socket.id });
    });

    // Hangup event
    socket.on('hangup', (room) => {
        socket.to(room).emit('peer-hangup');
        
        // Remove the room if exists
        if (rooms[room]) {
            delete rooms[room];
        }
    });

    // Handle user disconnection
    socket.on('disconnect', () => {
        console.log(`User ${socket.id} disconnected`);
        for (const room in rooms) {
            const index = rooms[room].participants.indexOf(socket.id);
            if (index !== -1) {
                rooms[room].participants.splice(index, 1);
                socket.to(room).emit('peer-hangup');
                
                if (rooms[room].participants.length === 0) {
                    delete rooms[room];
                }
                break;
            }
        }
    });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});