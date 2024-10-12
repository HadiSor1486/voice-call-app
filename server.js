const io = require('socket.io')(server);  // Ensure socket.io is set up properly
const rooms = {};  // Store participants in rooms

io.on('connection', (socket) => {
    console.log('New user connected:', socket.id);

    socket.on('create-room', ({ roomCode, username }) => {
        rooms[roomCode] = rooms[roomCode] || [];
        rooms[roomCode].push({ id: socket.id, username });
        socket.join(roomCode);
        io.to(roomCode).emit('participants-update', rooms[roomCode]);
    });

    socket.on('join-room', ({ roomCode, username }) => {
        if (rooms[roomCode]) {
            rooms[roomCode].push({ id: socket.id, username });
            socket.join(roomCode);
            io.to(roomCode).emit('participants-update', rooms[roomCode]);
            // Notify others in the room of the new participant for WebRTC connections
            socket.to(roomCode).emit('new-participant', socket.id);
        } else {
            socket.emit('error', 'Room does not exist.');
        }
    });

    // Handle WebRTC offer from a peer
    socket.on('offer', ({ offer, to }) => {
        io.to(to).emit('offer', { offer, from: socket.id });
    });

    // Handle WebRTC answer from a peer
    socket.on('answer', ({ answer, to }) => {
        io.to(to).emit('answer', { answer, from: socket.id });
    });

    // Handle ICE candidate from a peer
    socket.on('new-ice-candidate', ({ candidate, to }) => {
        io.to(to).emit('new-ice-candidate', { candidate, from: socket.id });
    });

    // Disconnect and remove from room
    socket.on('disconnect', () => {
        for (const roomCode in rooms) {
            rooms[roomCode] = rooms[roomCode].filter(user => user.id !== socket.id);
            if (rooms[roomCode].length === 0) {
                delete rooms[roomCode];
            } else {
                io.to(roomCode).emit('participants-update', rooms[roomCode]);
            }
        }
    });
});
