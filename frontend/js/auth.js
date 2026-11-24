/**
 * QueueLess AI: Authentication & Role Guard System
 */

const AUTH = {
  getToken: () => localStorage.getItem('queueless_token'),
  
  getUser: () => {
    try {
      const u = localStorage.getItem('queueless_user');
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  },

  setUser: (token, user) => {
    localStorage.setItem('queueless_token', token);
    localStorage.setItem('queueless_user', JSON.stringify(user));
  },

  logout: () => {
    localStorage.removeItem('queueless_token');
    localStorage.removeItem('queueless_user');
    window.location.href = 'login.html';
  },

  isAuthenticated: () => !!AUTH.getToken(),

  requireAuth: () => {
    if (!AUTH.isAuthenticated()) {
      window.location.href = `login.html?redirect=${encodeURIComponent(window.location.pathname)}`;
      return false;
    }
    return true;
  },

  requireRole: (...allowedRoles) => {
    if (!AUTH.requireAuth()) return false;
    const user = AUTH.getUser();
    if (!user || !allowedRoles.includes(user.role)) {
      alert(`Access Restricted: This dashboard requires role: [${allowedRoles.join(', ')}]. You are logged in as '${user?.role || 'Guest'}'.`);
      AUTH.redirectByRole(user?.role);
      return false;
    }
    return true;
  },

  redirectByRole: (role) => {
    switch (role) {
      case 'super_admin':
        window.location.href = 'super-admin-dashboard.html';
        break;
      case 'org_admin':
        window.location.href = 'admin-dashboard.html';
        break;
      case 'staff':
        window.location.href = 'staff-dashboard.html';
        break;
      case 'customer':
      default:
        window.location.href = 'user-dashboard.html';
        break;
    }
  },

  initNav: () => {
    const user = AUTH.getUser();
    const navUserEl = document.getElementById('nav-user-area');
    if (!navUserEl) return;

    if (user) {
      navUserEl.innerHTML = `
        <div class="dropdown">
          <button class="btn btn-sm btn-outline-primary dropdown-toggle d-flex align-items-center gap-2" type="button" data-bs-toggle="dropdown">
            <i class="bi bi-person-circle fs-6"></i>
            <span>${user.full_name || user.email}</span>
            <span class="badge bg-secondary text-uppercase" style="font-size:0.65rem;">${user.role}</span>
          </button>
          <ul class="dropdown-menu dropdown-menu-end shadow-sm">
            <li><h6 class="dropdown-header">${user.email}</h6></li>
            <li><a class="dropdown-item" href="javascript:void(0)" onclick="AUTH.redirectByRole('${user.role}')"><i class="bi bi-speedometer2 me-2"></i>My Dashboard</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item text-danger" href="javascript:void(0)" onclick="AUTH.logout()"><i class="bi bi-box-arrow-right me-2"></i>Logout</a></li>
          </ul>
        </div>
      `;
    } else {
      navUserEl.innerHTML = `
        <div class="d-flex align-items-center gap-2">
          <a href="login.html" class="btn btn-sm btn-outline-primary">Login</a>
          <a href="register.html" class="btn btn-sm btn-primary">Sign Up</a>
        </div>
      `;
    }
  }
};

window.AUTH = AUTH;
document.addEventListener('DOMContentLoaded', AUTH.initNav);
