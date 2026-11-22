/**
 * CinePass API Client & Utility Functions
 */

const isFileProtocol = typeof window !== 'undefined' && window.location.protocol === 'file:';
const API_BASE = isFileProtocol ? 'http://localhost:3000/api' : '/api';

// If opened directly from file explorer, show a helpful top bar notification
if (isFileProtocol) {
  window.addEventListener('DOMContentLoaded', () => {
    const banner = document.createElement('div');
    banner.style.cssText = 'background: #dc2626; color: #fff; padding: 0.65rem 1rem; text-align: center; font-size: 0.85rem; font-weight: 600; position: sticky; top: 0; z-index: 99999; box-shadow: 0 4px 12px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; gap: 0.75rem;';
    banner.innerHTML = `
      <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.1rem;"></i>
      <span>File Protocol Detected: To connect to the live SQL database and book tickets, start the server with <code>npm start</code> and visit <strong><a href="http://localhost:3000" style="color: #fde047; text-decoration: underline;">http://localhost:3000</a></strong></span>
    `;
    document.body.prepend(banner);
  });
}

const CinePassAPI = {
  // Database status
  async getStatus() {
    const res = await fetch(`${API_BASE}/status`);
    return res.json();
  },

  // Movies
  async getMovies(filters = {}) {
    const params = new URLSearchParams();
    if (filters.genre && filters.genre !== 'All') params.append('genre', filters.genre);
    if (filters.search) params.append('search', filters.search);
    if (filters.featured) params.append('featured', filters.featured);

    const res = await fetch(`${API_BASE}/movies?${params.toString()}`);
    return res.json();
  },

  async getMovieDetails(movieId) {
    const res = await fetch(`${API_BASE}/movies/${movieId}`);
    return res.json();
  },

  // Showtime & Seats
  async getShowtime(showtimeId) {
    const res = await fetch(`${API_BASE}/showtimes/${showtimeId}`);
    return res.json();
  },

  // Concessions
  async getConcessions() {
    const res = await fetch(`${API_BASE}/concessions`);
    return res.json();
  },

  // Bookings
  async createBooking(bookingData) {
    const res = await fetch(`${API_BASE}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bookingData)
    });
    return res.json();
  },

  async getBookings(filters = {}) {
    const params = new URLSearchParams();
    if (filters.ref) params.append('ref', filters.ref);
    if (filters.email) params.append('email', filters.email);
    if (filters.phone) params.append('phone', filters.phone);

    const res = await fetch(`${API_BASE}/bookings?${params.toString()}`);
    return res.json();
  },

  async getBookingByRef(ref) {
    const res = await fetch(`${API_BASE}/bookings/ref/${encodeURIComponent(ref)}`);
    return res.json();
  },

  async cancelBooking(bookingId) {
    const res = await fetch(`${API_BASE}/bookings/${bookingId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    return res.json();
  },

  // Admin
  async getAdminStats() {
    const res = await fetch(`${API_BASE}/admin/stats`);
    return res.json();
  },

  async addMovie(movieData) {
    const res = await fetch(`${API_BASE}/admin/movies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(movieData)
    });
    return res.json();
  },

  async executeSQL(query) {
    const res = await fetch(`${API_BASE}/admin/sql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    return res.json();
  },

  async cleanDemoData() {
    const res = await fetch(`${API_BASE}/admin/clean-demo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    return res.json();
  }
};

// Toast Notifications Helper
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let icon = 'info-circle';
  if (type === 'success') icon = 'check-circle';
  if (type === 'error') icon = 'exclamation-circle';

  toast.innerHTML = `<i class="fa-solid fa-${icon}"></i> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Format currency
function formatCurrency(amount) {
  return '₹' + parseFloat(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// Format 24-hr time to 12-hr AM/PM
function formatTime(timeStr) {
  if (!timeStr) return '';
  const parts = timeStr.split(':');
  let hour = parseInt(parts[0], 10);
  const minute = parts[1];
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12;
  hour = hour ? hour : 12;
  return `${hour}:${minute} ${ampm}`;
}

// Format date to readable string
function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

// Live database badge updater
async function updateDbStatusBadge() {
  try {
    const badge = document.getElementById('db-status-badge');
    if (!badge) return;
    const data = await CinePassAPI.getStatus();
    if (data.status === 'online') {
      const engineName = data.mysql_version && data.mysql_version.includes('SQLite') ? 'SQLite Engine' : 'MySQL 8.0';
      badge.innerHTML = `<span class="pulse-dot"></span> Live ${engineName} (${data.latency_ms}ms)`;
      badge.title = `Host: ${data.host} | DB: ${data.database} | ${data.metrics.upcoming_shows} upcoming shows`;
    }
  } catch (err) {
    const badge = document.getElementById('db-status-badge');
    if (badge) {
      badge.innerHTML = `<span style="color:#ef4444;"><i class="fa-solid fa-triangle-exclamation"></i> Server Offline</span>`;
      badge.title = 'Node server is not running. Run "npm start" and visit http://localhost:3000';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  updateDbStatusBadge();
});

