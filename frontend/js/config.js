/**
 * QueueLess AI: Dynamic Frontend Configuration
 * Automatically handles localhost, Render, and Vercel environments
 */

const BACKEND_URL_OVERRIDE = 'https://queue-less-ai-ktd1.vercel.app';

const getDefaultBackendUrl = () => {
  // If hosted on Render or unified Express serving frontend
  if (window.location.port === '5000') {
    return window.location.origin;
  }
  // If local development frontend on another port (e.g. 5500, 3000)
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:5000';
  }
  // In production if frontend is separate (e.g. Vercel), point to Render backend
  return window.location.origin;
};

const BACKEND_URL = (BACKEND_URL_OVERRIDE || getDefaultBackendUrl()).replace(/\/+$/, '');
const API_BASE_URL = `${BACKEND_URL}/api`;
const SOCKET_URL = BACKEND_URL;

window.APP_CONFIG = {
  BACKEND_URL,
  API_BASE_URL,
  SOCKET_URL,
  REALTIME_ENABLED: !BACKEND_URL.includes('.vercel.app')
};
