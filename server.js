const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

// Set up the Express app
const app = express();
const server = http.createServer(app);  // Create the HTTP server

// Initialize Socket.IO with the HTTP server
const io = socketIo(server);

const rooms = {};  // Store participants in rooms

io.on('connection', (socket) => {
    console.log('New user connected:', socket.id);

    // Handle room creation
    socket.on('create-room', ({ roomCode, username }) => {
        // Create the room if it doesn't exist
        rooms[roomCode] = rooms[roomCode] || [];
        
        // Add the user to the room's participants
        rooms[roomCode].push({ id: socket.id, username });
        socket.join(roomCode);

        // Send updated participants list to everyone in the room
        io.to(roomCode).emit('participants-update', rooms[roomCode]);
    });

    // Handle room joining
    socket.on('join-room', ({ roomCode, username }) => {
        if (rooms[roomCode]) {
            // Add the new user to the room
            rooms[roomCode].push({ id: socket.id, username });
            socket.join(roomCode);

            // Notify the room of the new participant
            io.to(roomCode).emit('participants-update', rooms[roomCode]);

            // Notify existing participants of the new user
            socket.to(roomCode).emit('new-participant', socket.id);
        } else {
            // If the room doesn't exist, notify the user
            socket.emit('error', 'Room does not exist.');
        }
    });

    // Handle WebRTC offer
    socket.on('offer', ({ offer, to }) => {
        // Send the offer to the intended recipient
        io.to(to).emit('offer', { offer, from: socket.id });
    });

    // Handle WebRTC answer
    socket.on('answer', ({ answer, to }) => {
        // Send the answer back to the sender of the offer
        io.to(to).emit('answer', { answer, from: socket.id });
    });

    // Handle ICE candidate
    socket.on('new-ice-candidate', ({ candidate, to }) => {
        // Send the ICE candidate to the intended peer
        io.to(to).emit('new-ice-candidate', { candidate, from: socket.id });
    });

    // Handle user disconnect
    socket.on('disconnect', () => {
        // Remove the user from the rooms they're in
        for (const roomCode in rooms) {
            rooms[roomCode] = rooms[roomCode].filter(user => user.id !== socket.id);

            // If the room is empty, delete it
            if (rooms[roomCode].length === 0) {
                delete rooms[roomCode];
            } else {
                // Update the room's participants list
                io.to(roomCode).emit('participants-update', rooms[roomCode]);
            }
        }
        console.log('User disconnected:', socket.id);
    });
});

// Serve the frontend (index.html, etc.)
app.use(express.static('public'));

// Listen on the specified port
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
