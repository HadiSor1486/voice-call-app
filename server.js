const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

// Create an Express app
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Serve static files (HTML, JS)
app.use(express.static('public'));

// Listen for WebSocket connections
io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);

  // Relay the offer from one peer to another
  socket.on('offer', (offer) => {
    socket.broadcast.emit('offer', offer);
  });

  // Relay the answer from one peer to another
  socket.on('answer', (answer) => {
    socket.broadcast.emit('answer', answer);
  });

  // Relay ICE candidates between peers
  socket.on('new-ice-candidate', (candidate) => {
    socket.broadcast.emit('new-ice-candidate', candidate);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Start the server
server.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});
