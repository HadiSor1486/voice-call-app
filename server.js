io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);

  socket.on('create-room', ({ roomCode, username }) => {
    socket.join(roomCode);
    rooms[roomCode] = rooms[roomCode] || [];
    rooms[roomCode].push({ id: socket.id, username });
    io.to(roomCode).emit('participants-update', rooms[roomCode]);
  });

  socket.on('join-room', ({ roomCode, username }) => {
    if (rooms[roomCode]) {
      socket.join(roomCode);
      rooms[roomCode].push({ id: socket.id, username });
      io.to(roomCode).emit('participants-update', rooms[roomCode]);
    } else {
      socket.emit('error', 'Room not found');
    }
  });

  // WebRTC signaling
  socket.on('offer', (data) => {
    socket.to(data.to).emit('offer', { from: socket.id, offer: data.offer });
  });

  socket.on('answer', (data) => {
    socket.to(data.to).emit('answer', { from: socket.id, answer: data.answer });
  });

  socket.on('new-ice-candidate', (data) => {
    socket.to(data.to).emit('new-ice-candidate', { from: socket.id, candidate: data.candidate });
  });

  socket.on('disconnect', () => {
    for (const roomCode in rooms) {
      rooms[roomCode] = rooms[roomCode].filter(participant => participant.id !== socket.id);
      io.to(roomCode).emit('participants-update', rooms[roomCode]);
    }
    console.log('User disconnected:', socket.id);
  });
});
