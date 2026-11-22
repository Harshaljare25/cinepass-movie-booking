/**
 * CinePass - Booking History & Cancellation Manager
 */

let myBookingsList = [];
let pendingCancelId = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadBookings();

  const searchInput = document.getElementById('search-bookings-input');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(() => {
      filterBookings(searchInput.value.trim());
    }, 300));
  }
});

async function loadBookings() {
  try {
    const res = await CinePassAPI.getBookings();
    if (res.success) {
      myBookingsList = res.bookings;
      renderBookings(myBookingsList);
    }
  } catch (err) {
    console.error('Failed to load bookings:', err);
    showToast('Failed to load bookings from database.', 'error');
  }
}

function renderBookings(bookings) {
  const container = document.getElementById('bookings-list-container');
  const countEl = document.getElementById('bookings-count');
  if (!container) return;

  if (countEl) countEl.textContent = `${bookings.length} Bookings Found`;

  if (bookings.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 4rem 1rem; color: var(--text-muted);">
        <i class="fa-solid fa-ticket-simple" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.4;"></i>
        <h3>No Bookings Found</h3>
        <p>Book tickets to your favorite movies to see them listed here.</p>
        <a href="index.html" class="btn btn-primary" style="margin-top: 1.5rem;">
          <i class="fa-solid fa-film"></i> Browse Movies
        </a>
      </div>
    `;
    return;
  }

  container.innerHTML = bookings.map(b => {
    const isCancelled = b.booking_status === 'CANCELLED';

    return `
      <div class="booking-card" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-lg); padding:1.5rem; margin-bottom:1.5rem; display:grid; grid-template-columns:100px 1fr auto; gap:1.5rem; align-items:center;">
        <img src="${b.movie_poster}" alt="${b.movie_title}" style="width:100px; height:140px; object-fit:cover; border-radius:var(--radius-md);" />
        <div>
          <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:0.4rem;">
            <span style="font-weight:800; font-size:1.15rem; color:#fff;">${b.movie_title}</span>
            <span class="status-badge ${isCancelled ? 'cancelled' : 'confirmed'}">
              <i class="fa-solid ${isCancelled ? 'fa-ban' : 'fa-check'}"></i> ${b.booking_status}
            </span>
          </div>
          <p style="color:var(--text-muted); font-size:0.88rem; margin-bottom:0.4rem;">
            <i class="fa-solid fa-location-dot" style="color:var(--accent-red);"></i> ${b.theater_name} (${b.screen_name})
          </p>
          <p style="color:var(--text-muted); font-size:0.88rem; margin-bottom:0.4rem;">
            <i class="fa-regular fa-calendar"></i> ${formatDate(b.show_date)} at ${formatTime(b.show_time)}
          </p>
          <div style="display:flex; gap:1.5rem; font-size:0.85rem; color:var(--text-dim); margin-top:0.6rem;">
            <span><strong>Seats:</strong> ${b.seats_list}</span>
            <span><strong>Ref:</strong> <code style="color:var(--accent-cyan);">${b.booking_reference}</code></span>
            <span><strong>Total:</strong> <strong style="color:#fff;">${formatCurrency(b.total_amount)}</strong></span>
          </div>
        </div>
        <div style="display:flex; flex-direction:column; gap:0.6rem;">
          <a href="confirmation.html?ref=${encodeURIComponent(b.booking_reference)}" class="btn btn-secondary btn-sm">
            <i class="fa-solid fa-qrcode"></i> View Ticket
          </a>
          ${!isCancelled ? `
            <button class="btn btn-outline btn-sm" onclick="promptCancelBooking(${b.id}, '${b.booking_reference}')" style="border-color:#ef4444; color:#ef4444;">
              <i class="fa-solid fa-xmark"></i> Cancel Booking
            </button>
          ` : `
            <span style="font-size:0.78rem; color:#ef4444; text-align:center;">Seats Released</span>
          `}
        </div>
      </div>
    `;
  }).join('');
}

function filterBookings(term) {
  if (!term) {
    renderBookings(myBookingsList);
    return;
  }
  const lower = term.toLowerCase();
  const filtered = myBookingsList.filter(b => 
    b.booking_reference.toLowerCase().includes(lower) ||
    b.movie_title.toLowerCase().includes(lower) ||
    b.customer_name.toLowerCase().includes(lower) ||
    b.customer_email.toLowerCase().includes(lower) ||
    b.customer_phone.includes(lower)
  );
  renderBookings(filtered);
}

function promptCancelBooking(bookingId, bookingRef) {
  pendingCancelId = bookingId;
  const modal = document.getElementById('cancel-modal');
  const refText = document.getElementById('cancel-modal-ref');
  if (refText) refText.textContent = bookingRef;
  if (modal) modal.classList.add('show');
}

function closeCancelModal() {
  pendingCancelId = null;
  const modal = document.getElementById('cancel-modal');
  if (modal) modal.classList.remove('show');
}

async function confirmCancelBooking() {
  if (!pendingCancelId) return;

  try {
    const res = await CinePassAPI.cancelBooking(pendingCancelId);
    if (res.success) {
      showToast('Booking cancelled! Seats released back to live database.', 'success');
      closeCancelModal();
      await loadBookings();
    } else {
      showToast(res.message || 'Failed to cancel booking.', 'error');
    }
  } catch (err) {
    console.error('Cancellation error:', err);
    showToast('Failed to cancel booking.', 'error');
  }
}

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

