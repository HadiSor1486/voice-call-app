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
        // Check if the client is already in a room
        for (const r in rooms) {
            if (rooms[r].includes(socket.id)) {
                // Remove the client from their current room
                rooms[r] = rooms[r].filter(id => id !== socket.id);
                if (rooms[r].length === 0) {
                    delete rooms[r];
                }
                break;
            }
        }

        // Create a new room
        if (!rooms[room]) {
            rooms[room] = [];
        }
        rooms[room].push(socket.id);
        socket.join(room);
        console.log(`Room ${room} created or joined by ${socket.id}`);
        socket.emit('room-created', room);
    });

    // Handle 'join-room' event
    socket.on('join-room', (room) => {
        if (rooms[room]) {
            // Check if the client is already in the room
            if (rooms[room].includes(socket.id)) {
                // The client is already in the room, do nothing
                return;
            }

            rooms[room].push(socket.id);
            socket.join(room);
            socket.to(room).emit('user-joined', { id: socket.id });
            console.log(`User ${socket.id} joined room ${room}`);
        } else {
            socket.emit('error', 'Room does not exist.');
        }
    });

    // Hangup event
    socket.on('hangup', (room) => {
        socket.to(room).emit('peer-hangup');
    });

    // WebRTC signaling events remain the same as in previous version
    socket.on('offer', ({ offer, room }) => {
        socket.to(room).emit('offer', { offer, id: socket.id });
    });

    socket.on('answer', ({ answer, room }) => {
        socket.to(room).emit('answer', { answer, id: socket.id });
    });

    socket.on('new-ice-candidate', ({ candidate, room }) => {
        socket.to(room).emit('new-ice-candidate', { candidate, id: socket.id });
    });

    // Handle user disconnection
    socket.on('disconnect', () => {
        console.log(`User ${socket.id} disconnected`);
        for (const room in rooms) {
            const index = rooms[room].indexOf(socket.id);
            if (index !== -1) {
                rooms[room].splice(index, 1);
                socket.to(room).emit('user-left', { id: socket.id });
                if (rooms[room].length === 0) {
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