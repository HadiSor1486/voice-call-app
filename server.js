socket.on('offer', ({ offer, room }) => {
    socket.to(room).emit('offer', { offer });
  });
  
  socket.on('answer', ({ answer, room }) => {
    socket.to(room).emit('answer', { answer });
  });
  
  socket.on('new-ice-candidate', ({ candidate, room }) => {
    socket.to(room).emit('new-ice-candidate', { candidate });
  });
  