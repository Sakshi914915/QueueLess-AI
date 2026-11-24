let ioInstance = null;

const initSocketIO = (io) => {
  ioInstance = io;

  io.on('connection', (socket) => {
    console.log(`[SOCKET] Client connected: ${socket.id}`);

    // Join room for a specific token (e.g. customer tracking page)
    socket.on('join_token', (tokenId) => {
      if (tokenId) {
        socket.join(`token_${tokenId}`);
        console.log(`[SOCKET] ${socket.id} joined token_${tokenId}`);
      }
    });

    // Join room for a branch / service queue (e.g. staff dashboard, public display)
    socket.on('join_branch', (branchId) => {
      if (branchId) {
        socket.join(`branch_${branchId}`);
        console.log(`[SOCKET] ${socket.id} joined branch_${branchId}`);
      }
    });

    // Join private room for a customer user (e.g. notifications)
    socket.on('join_user', (userId) => {
      if (userId) {
        socket.join(`user_${userId}`);
        console.log(`[SOCKET] ${socket.id} joined user_${userId}`);
      }
    });

    // Join counter room
    socket.on('join_counter', (counterId) => {
      if (counterId) {
        socket.join(`counter_${counterId}`);
        console.log(`[SOCKET] ${socket.id} joined counter_${counterId}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[SOCKET] Client disconnected: ${socket.id}`);
    });
  });
};

const getIO = () => {
  return ioInstance;
};

// Real-time broadcast helpers
const broadcastQueueUpdate = (branchId, serviceId, payload) => {
  if (!ioInstance) return;
  ioInstance.to(`branch_${branchId}`).emit('queue_updated', {
    branchId,
    serviceId,
    ...payload,
    timestamp: new Date().toISOString()
  });
};

const broadcastTokenUpdate = (tokenId, payload) => {
  if (!ioInstance) return;
  ioInstance.to(`token_${tokenId}`).emit('token_status_changed', {
    tokenId,
    ...payload,
    timestamp: new Date().toISOString()
  });
};

const broadcastUserNotification = (userId, notification) => {
  if (!ioInstance) return;
  ioInstance.to(`user_${userId}`).emit('new_notification', {
    ...notification,
    timestamp: new Date().toISOString()
  });
};

const broadcastPublicDisplay = (branchId, payload) => {
  if (!ioInstance) return;
  ioInstance.to(`branch_${branchId}`).emit('public_display_updated', {
    branchId,
    ...payload,
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  initSocketIO,
  getIO,
  broadcastQueueUpdate,
  broadcastTokenUpdate,
  broadcastUserNotification,
  broadcastPublicDisplay
};
