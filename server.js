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
            rooms[room] = [];
        }
        rooms[room].push(socket.id);
        socket.join(room);
        console.log(`Room ${room} created or joined by ${socket.id}`);
        socket.emit('room-created', room); // Send back confirmation of room creation
    });

    // Handle 'join-room' event
    socket.on('join-room', (room) => {
        if (rooms[room]) {
            rooms[room].push(socket.id);
            socket.join(room);
            socket.to(room).emit('call-started'); // Notify others in the room
            console.log(`User ${socket.id} joined room ${room}`);
        } else {
            socket.emit('error', 'Room does not exist.');
        }
    });

    // Handle WebRTC signaling
    socket.on('offer', ({ offer, room }) => {
        console.log(`Offer received in room ${room}`);
        socket.to(room).emit('offer', { offer, id: socket.id });
    });

    socket.on('answer', ({ answer, room }) => {
        console.log(`Answer received in room ${room}`);
        socket.to(room).emit('answer', { answer, id: socket.id });
    });

    socket.on('new-ice-candidate', ({ candidate, room }) => {
        console.log(`ICE Candidate received in room ${room}`);
        socket.to(room).emit('new-ice-candidate', { candidate, id: socket.id });
    });

    // Handle user disconnection
    socket.on('disconnect', () => {
        console.log(`User ${socket.id} disconnected`);
        for (const room in rooms) {
            const index = rooms[room].indexOf(socket.id);
            if (index !== -1) {
                rooms[room].splice(index, 1);
                socket.to(room).emit('call-ended'); // Notify the room that the call has ended
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
