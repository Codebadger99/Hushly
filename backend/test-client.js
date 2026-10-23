const { io } = require('socket.io-client');

const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('Client connected with id:', socket.id);
  setTimeout(() => socket.disconnect(), 2000);
});