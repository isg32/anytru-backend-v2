
const io = require('socket.io-client');
const socket = io('http://localhost:8000');

module.exports = { socket };
