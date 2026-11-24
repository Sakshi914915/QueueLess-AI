/**
 * QueueLess AI: Real-Time WebSockets Client (Socket.IO)
 */

let socketInstance = null;

const initSocket = () => {
  if (typeof io === 'undefined') {
    console.warn('[Socket] Socket.io client script not loaded.');
    return null;
  }

  if (socketInstance) return socketInstance;

  const url = window.APP_CONFIG.SOCKET_URL;
  socketInstance = io(url, {
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 10
  });

  socketInstance.on('connect', () => {
    console.log(`[Socket] Connected to server: ${socketInstance.id}`);

    // If user is logged in, join private user room
    const user = window.AUTH ? window.AUTH.getUser() : null;
    if (user && user.id) {
      socketInstance.emit('join_user', user.id);
    }
  });

  // Global handler for personal notifications
  socketInstance.on('new_notification', (data) => {
    console.log('[Socket] Incoming notification:', data);
    if (window.API && window.API.showToast) {
      window.API.showToast(`<strong>${data.title}</strong><br>${data.message}`, 'info', 6000);
    }
    // Play subtle audio alert if user allows
    try {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      audio.volume = 0.4;
      audio.play().catch(() => {});
    } catch {}
  });

  return socketInstance;
};

window.SOCKET = {
  init: initSocket,
  get: () => socketInstance || initSocket(),
  joinBranch: (branchId) => {
    const s = socketInstance || initSocket();
    if (s && branchId) s.emit('join_branch', branchId);
  },
  joinToken: (tokenId) => {
    const s = socketInstance || initSocket();
    if (s && tokenId) s.emit('join_token', tokenId);
  },
  joinCounter: (counterId) => {
    const s = socketInstance || initSocket();
    if (s && counterId) s.emit('join_counter', counterId);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  if (typeof io !== 'undefined') {
    initSocket();
  }
});
