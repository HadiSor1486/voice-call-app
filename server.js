const io = require('socket.io')(server);

let rooms = {}; // Keep track of rooms and participants

io.on('connection', (socket) => {
    console.log('New client connected', socket.id);

    // Handle room creation
    socket.on('create-room', (roomCode) => {
        if (!rooms[roomCode]) {
            rooms[roomCode] = [];
        }
        rooms[roomCode].push(socket.id);
        console.log(`Room ${roomCode} created with user ${socket.id}`);
        socket.emit('room-created', roomCode);  // Emit the room code back to the user
        io.to(socket.id).emit('update-participants', rooms[roomCode]);
    });

    // Handle room joining
    socket.on('join-room', (roomCode) => {
        if (rooms[roomCode]) {
            rooms[roomCode].push(socket.id);
            console.log(`User ${socket.id} joined room ${roomCode}`);
            io.to(socket.id).emit('update-participants', rooms[roomCode]); // Send the participant list to the joining user
            socket.emit('room-joined', roomCode); // Confirm room join to user
        } else {
            socket.emit('room-not-found');  // If room doesn't exist
        }
    });

    // Handle ICE candidates exchange
    socket.on('new-ice-candidate', (candidate, roomCode) => {
        socket.broadcast.to(roomCode).emit('new-ice-candidate', candidate);
    });

    // Handle call ending
    socket.on('leave-call', () => {
        for (let roomCode in rooms) {
            const room = rooms[roomCode];
            const index = room.indexOf(socket.id);
            if (index !== -1) {
                room.splice(index, 1); // Remove user from the room
                break;
            }
        }
        io.emit('call-ended');  // Notify all users that the call has ended
    });

    // Disconnect event
    socket.on('disconnect', () => {
        console.log('Client disconnected', socket.id);
        for (let roomCode in rooms) {
            const room = rooms[roomCode];
            const index = room.indexOf(socket.id);
            if (index !== -1) {
                room.splice(index, 1);  // Remove user from the room
                break;
            }
        }
    });
});
