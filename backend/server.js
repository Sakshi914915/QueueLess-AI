const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const { testConnection } = require('./config/db');
const { initSocketIO } = require('./sockets/socketManager');

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

initSocketIO(io);

// Start server after verifying DB connection
async function startServer() {
  const isConnected = await testConnection();
  if (!isConnected) {
    console.error('[SERVER] Critical: MySQL Database connection failed. Please check your credentials in .env.');
  }

  server.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 QueueLess AI Full-Stack Platform Server is Running!`);
    console.log(`📡 HTTP & REST API: http://localhost:${PORT}`);
    console.log(`⚡ Real-time WebSockets: Active on port ${PORT}`);
    console.log(`🌐 Public Web Frontend: http://localhost:${PORT}`);
    console.log(`🏥 Health Check: http://localhost:${PORT}/api/health`);
    console.log(`=======================================================`);
  });
}

startServer();
