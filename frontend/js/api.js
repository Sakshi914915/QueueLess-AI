/**
 * QueueLess AI: Centralized Fetch API Client with Toast Notifications
 */

const showToast = (message, type = 'info', duration = 4000) => {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast-custom ${type}`;

  const iconMap = {
    success: 'bi-check-circle-fill text-success',
    error: 'bi-exclamation-octagon-fill text-danger',
    warning: 'bi-exclamation-triangle-fill text-warning',
    info: 'bi-info-circle-fill text-primary'
  };

  toast.innerHTML = `
    <i class="bi ${iconMap[type] || iconMap.info} fs-5"></i>
    <div class="toast-body flex-grow-1">${message}</div>
    <button type="button" class="btn-close btn-sm" onclick="this.parentElement.remove()"></button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }
  }, duration);
};

const apiRequest = async (endpoint, options = {}) => {
  const token = localStorage.getItem('queueless_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const url = `${window.APP_CONFIG.API_BASE_URL}${endpoint}`;

  try {
    const res = await fetch(url, {
      ...options,
      headers
    });

    // Handle CSV or file downloads
    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('text/csv')) {
      return res;
    }

    const data = await res.json();

    if (!res.ok) {
      const errorMsg = data.message || `Request failed with status ${res.status}`;
      if (res.status === 401 && !endpoint.includes('/auth/login')) {
        // Expired token
        localStorage.removeItem('queueless_token');
        localStorage.removeItem('queueless_user');
        window.location.href = 'login.html';
      }
      throw new Error(errorMsg);
    }

    return data;
  } catch (err) {
    console.error(`[API Error] ${endpoint}:`, err);
    throw err;
  }
};

window.API = {
  get: (endpoint, options = {}) => apiRequest(endpoint, { method: 'GET', ...options }),
  post: (endpoint, body = {}, options = {}) => apiRequest(endpoint, { method: 'POST', body: JSON.stringify(body), ...options }),
  put: (endpoint, body = {}, options = {}) => apiRequest(endpoint, { method: 'PUT', body: JSON.stringify(body), ...options }),
  del: (endpoint, options = {}) => apiRequest(endpoint, { method: 'DELETE', ...options }),
  showToast
};
