/**
 * CinePass - Seat Selection & Booking Engine
 */

let currentMovie = null;
let allShowtimes = [];
let selectedDate = null;
let selectedShowtime = null;
let seatMapData = [];
let selectedSeats = []; // [{ seat_code, tier, price }]
let concessionsList = [];
let selectedConcessions = {}; // { concessionId: qty }
let appliedDiscount = 0;
let appliedPromoCode = null;

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const movieId = urlParams.get('movieId') || '1';
  const showtimeId = urlParams.get('showtimeId');

  await loadMovieDetails(movieId);
  await loadConcessions();

  if (showtimeId) {
    await selectShowtimeById(showtimeId);
  }
});

async function loadMovieDetails(movieId) {
  try {
    const res = await CinePassAPI.getMovieDetails(movieId);
    if (!res.success) {
      showToast('Movie not found.', 'error');
      return;
    }

    currentMovie = res.movie;
    allShowtimes = res.showtimes;

    renderHeaderDetails(currentMovie);
    renderDateSelector(allShowtimes);
  } catch (err) {
    console.error('Error loading movie details:', err);
    showToast('Failed to load showtimes.', 'error');
  }
}

function renderHeaderDetails(movie) {
  const backdrop = document.getElementById('header-backdrop');
  const poster = document.getElementById('header-poster');
  const title = document.getElementById('header-title');
  const meta = document.getElementById('header-meta');

  if (backdrop) backdrop.style.backgroundImage = `url('${movie.banner_url || movie.poster_url}')`;
  if (poster) poster.src = movie.poster_url;
  if (title) title.textContent = movie.title;
  if (meta) {
    meta.innerHTML = `
      <span class="cert-badge">${movie.certificate}</span>
      <span><i class="fa-solid fa-star" style="color:var(--accent-gold);"></i> ${movie.rating}</span>
      <span><i class="fa-regular fa-clock"></i> ${movie.duration_mins} mins</span>
      <span><i class="fa-solid fa-film"></i> ${movie.genre}</span>
      <span><i class="fa-solid fa-globe"></i> ${movie.language}</span>
    `;
  }
}

function renderDateSelector(showtimes) {
  const container = document.getElementById('date-cards-scroll');
  if (!container) return;

  // Extract unique show dates
  const uniqueDates = [...new Set(showtimes.map(s => s.show_date.split('T')[0]))].sort();

  if (uniqueDates.length === 0) {
    container.innerHTML = `<p style="color:var(--text-muted); padding:1rem;">No upcoming showtimes available for this movie.</p>`;
    return;
  }

  container.innerHTML = uniqueDates.map((dateStr, index) => {
    const d = new Date(dateStr);
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    const dayNumber = d.getDate();
    const monthName = d.toLocaleDateString('en-US', { month: 'short' });

    return `
      <div class="date-card ${index === 0 ? 'active' : ''}" data-date="${dateStr}" onclick="onSelectDate('${dateStr}', this)">
        <span class="day-name">${dayName}</span>
        <span class="day-number">${dayNumber}</span>
        <span class="month-name">${monthName}</span>
      </div>
    `;
  }).join('');

  // Default to first date
  selectedDate = uniqueDates[0];
  renderTheatersAndShowtimes(selectedDate);
}

function onSelectDate(dateStr, element) {
  document.querySelectorAll('.date-card').forEach(c => c.classList.remove('active'));
  element.classList.add('active');
  selectedDate = dateStr;
  renderTheatersAndShowtimes(selectedDate);

  // Clear any existing seat selection when changing date
  clearSeatSelection();
}

function renderTheatersAndShowtimes(dateStr) {
  const container = document.getElementById('theaters-container');
  if (!container) return;

  const showsForDate = allShowtimes.filter(s => s.show_date.split('T')[0] === dateStr);

  if (showsForDate.length === 0) {
    container.innerHTML = `<p style="color:var(--text-muted); text-align:center; padding:2rem;">No shows available on this date.</p>`;
    return;
  }

  // Group by theater
  const theatersMap = {};
  showsForDate.forEach(show => {
    if (!theatersMap[show.theater_id]) {
      theatersMap[show.theater_id] = {
        name: show.theater_name,
        address: show.theater_address,
        amenities: show.theater_amenities,
        shows: []
      };
    }
    theatersMap[show.theater_id].shows.push(show);
  });

  container.innerHTML = Object.values(theatersMap).map(theater => `
    <div class="theater-group-card">
      <div class="theater-info-row">
        <div>
          <h3 class="theater-name"><i class="fa-solid fa-location-dot" style="color:var(--accent-red); margin-right:0.4rem;"></i> ${theater.name}</h3>
          <p class="theater-address">${theater.address}</p>
        </div>
        <div>
          <span class="amenities-tag">${theater.amenities}</span>
        </div>
      </div>
      <div class="showtime-buttons-grid">
        ${theater.shows.map(show => `
          <button class="showtime-btn ${selectedShowtime && selectedShowtime.id === show.showtime_id ? 'active' : ''}" 
                  onclick="selectShowtimeById(${show.showtime_id})">
            <span class="time-text">${formatTime(show.show_time)}</span>
            <span class="screen-type-text">${show.screen_type}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `).join('');
}

async function selectShowtimeById(showtimeId) {
  try {
    const res = await CinePassAPI.getShowtime(showtimeId);
    if (!res.success) {
      showToast('Could not load showtime details.', 'error');
      return;
    }

    selectedShowtime = res.showtime;
    seatMapData = res.seatMap;
    selectedSeats = [];

    // Highlight active showtime button
    document.querySelectorAll('.showtime-btn').forEach(btn => btn.classList.remove('active'));
    event?.currentTarget?.classList?.add('active');

    // Update Step indicator
    updateStep(2);

    // Render Seat Map
    renderSeatMatrix(res);

    // Scroll to seat booking container
    const seatContainer = document.getElementById('seat-booking-section');
    if (seatContainer) {
      seatContainer.style.display = 'block';
      seatContainer.scrollIntoView({ behavior: 'smooth' });
    }

    updateFloatingBar();
  } catch (err) {
    console.error('Error fetching showtime:', err);
    showToast('Failed to load seat layout.', 'error');
  }
}

function renderSeatMatrix(data) {
  const container = document.getElementById('seat-matrix-wrapper');
  const detailsEl = document.getElementById('selected-show-details');
  if (!container) return;

  if (detailsEl) {
    detailsEl.innerHTML = `
      <span><strong>Theater:</strong> ${data.showtime.theater_name} (${data.showtime.screen_name})</span>
      <span>•</span>
      <span><strong>Time:</strong> ${formatTime(data.showtime.show_time)}</span>
      <span>•</span>
      <span><strong>Available:</strong> ${data.available_seats} / ${data.total_seats} Seats</span>
    `;
  }

  // Update Legend pricing
  const vipPriceEl = document.getElementById('legend-vip-price');
  const premPriceEl = document.getElementById('legend-premium-price');
  const stdPriceEl = document.getElementById('legend-standard-price');

  if (vipPriceEl) vipPriceEl.textContent = formatCurrency(data.showtime.price_vip);
  if (premPriceEl) premPriceEl.textContent = formatCurrency(data.showtime.price_premium);
  if (stdPriceEl) stdPriceEl.textContent = formatCurrency(data.showtime.price_standard);

  // Group seats by row
  const rowsMap = {};
  data.seatMap.forEach(seat => {
    if (!rowsMap[seat.row_label]) {
      rowsMap[seat.row_label] = {
        tier: seat.tier,
        price: seat.price,
        seats: []
      };
    }
    rowsMap[seat.row_label].seats.push(seat);
  });

  // Sort rows in cinema order: VIP at top (G, F), then Premium (E, D, C), then Standard (B, A)
  const sortedRowKeys = Object.keys(rowsMap).sort().reverse();

  let html = '';
  let lastTier = '';

  sortedRowKeys.forEach(rowKey => {
    const rowObj = rowsMap[rowKey];
    if (rowObj.tier !== lastTier) {
      html += `<div class="tier-section-title">${rowObj.tier} RECLINERS - ${formatCurrency(rowObj.price)}</div>`;
      lastTier = rowObj.tier;
    }

    html += `<div class="seat-row">
      <span class="row-label">${rowKey}</span>`;

    rowObj.seats.forEach(seat => {
      const isBooked = seat.is_booked;
      const isSelected = selectedSeats.some(s => s.seat_code === seat.seat_code);
      const tierClass = seat.tier === 'VIP' ? 'tier-vip' : (seat.tier === 'PREMIUM' ? 'tier-prem' : 'tier-std');

      html += `
        <div class="cinema-seat ${tierClass} ${isBooked ? 'booked' : ''} ${isSelected ? 'selected' : ''}"
             data-code="${seat.seat_code}"
             data-tier="${seat.tier}"
             data-price="${seat.price}"
             title="${seat.seat_code} (${seat.tier}) - ${formatCurrency(seat.price)}"
             onclick="toggleSeatSelection('${seat.seat_code}', '${seat.tier}', ${seat.price}, ${isBooked}, this)">
          ${seat.seat_number}
        </div>
      `;
    });

    html += `<span class="row-label">${rowKey}</span></div>`;
  });

  container.innerHTML = html;
}

function toggleSeatSelection(seatCode, tier, price, isBooked, element) {
  if (isBooked) {
    showToast(`Seat ${seatCode} is already booked. Please choose another seat.`, 'info');
    return;
  }

  const existingIndex = selectedSeats.findIndex(s => s.seat_code === seatCode);

  if (existingIndex > -1) {
    selectedSeats.splice(existingIndex, 1);
    element.classList.remove('selected');
  } else {
    if (selectedSeats.length >= 8) {
      showToast('Maximum 8 tickets allowed per booking.', 'info');
      return;
    }
    selectedSeats.push({ seat_code: seatCode, tier, price: parseFloat(price) });
    element.classList.add('selected');
  }

  updateFloatingBar();
}

function updateFloatingBar() {
  const bar = document.getElementById('floating-booking-bar');
  const countEl = document.getElementById('bar-seat-count');
  const chipsEl = document.getElementById('bar-seat-chips');
  const priceEl = document.getElementById('bar-total-price');

  if (!bar) return;

  if (selectedSeats.length === 0) {
    bar.classList.remove('show');
    return;
  }

  bar.classList.add('show');
  if (countEl) countEl.textContent = `${selectedSeats.length} Seat${selectedSeats.length > 1 ? 's' : ''}`;

  if (chipsEl) {
    chipsEl.innerHTML = selectedSeats.map(s => `
      <span class="seat-chip">${s.seat_code}</span>
    `).join('');
  }

  const seatsSubtotal = selectedSeats.reduce((sum, s) => sum + s.price, 0);
  const snacksTotal = calculateConcessionsTotal();
  const convenienceFee = 35.00 * selectedSeats.length;
  const grandTotal = Math.max(0, seatsSubtotal + snacksTotal + convenienceFee - appliedDiscount);

  if (priceEl) priceEl.textContent = formatCurrency(grandTotal);
}

function clearSeatSelection() {
  selectedSeats = [];
  document.querySelectorAll('.cinema-seat.selected').forEach(s => s.classList.remove('selected'));
  updateFloatingBar();
}

function updateStep(stepNumber) {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`step-${i}`);
    if (el) {
      el.classList.remove('active', 'completed');
      if (i === stepNumber) el.classList.add('active');
      else if (i < stepNumber) el.classList.add('completed');
    }
  }
}

// ===================================================================
// Concessions & Food Ordering
// ===================================================================
async function loadConcessions() {
  try {
    const res = await CinePassAPI.getConcessions();
    if (res.success) {
      concessionsList = res.concessions;
      renderConcessionsGrid();
    }
  } catch (err) {
    console.error('Failed to load concessions:', err);
  }
}

function renderConcessionsGrid() {
  const grid = document.getElementById('concessions-grid');
  if (!grid) return;

  grid.innerHTML = concessionsList.map(item => {
    const qty = selectedConcessions[item.id] || 0;
    return `
      <div class="concession-card">
        <img src="${item.image_url}" alt="${item.name}" class="concession-img" />
        <div class="concession-details">
          <h4 class="concession-name">${item.name}</h4>
          <p class="concession-desc">${item.description || ''}</p>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.5rem;">
            <span class="concession-price">${formatCurrency(item.price)}</span>
            <div class="qty-control">
              <button class="qty-btn" onclick="updateConcessionQty(${item.id}, -1)">-</button>
              <span class="qty-count" id="concession-qty-${item.id}">${qty}</span>
              <button class="qty-btn" onclick="updateConcessionQty(${item.id}, 1)">+</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function updateConcessionQty(itemId, delta) {
  const current = selectedConcessions[itemId] || 0;
  const updated = Math.max(0, current + delta);
  if (updated === 0) {
    delete selectedConcessions[itemId];
  } else {
    selectedConcessions[itemId] = updated;
  }

  const countEl = document.getElementById(`concession-qty-${itemId}`);
  if (countEl) countEl.textContent = updated;

  updateFloatingBar();
}

function calculateConcessionsTotal() {
  let total = 0;
  for (const [id, qty] of Object.entries(selectedConcessions)) {
    const item = concessionsList.find(c => c.id == id);
    if (item) total += item.price * qty;
  }
  return total;
}

// ===================================================================
// Checkout Modal & Flow
// ===================================================================
function openCheckoutModal() {
  if (selectedSeats.length === 0) {
    showToast('Please select at least one seat first.', 'info');
    return;
  }

  updateStep(3);
  renderCheckoutSummary();

  const modal = document.getElementById('checkout-modal');
  if (modal) modal.classList.add('show');
}

function closeCheckoutModal() {
  const modal = document.getElementById('checkout-modal');
  if (modal) modal.classList.remove('show');
}

function renderCheckoutSummary() {
  const summaryMovieTitle = document.getElementById('summary-movie-title');
  const summaryCinema = document.getElementById('summary-cinema');
  const summarySeats = document.getElementById('summary-seats');
  const summaryTicketsSubtotal = document.getElementById('summary-tickets-subtotal');
  const summaryConcessionsSubtotal = document.getElementById('summary-concessions-subtotal');
  const summaryFee = document.getElementById('summary-fee');
  const summaryDiscountRow = document.getElementById('summary-discount-row');
  const summaryDiscount = document.getElementById('summary-discount');
  const summaryGrandTotal = document.getElementById('summary-grand-total');

  if (summaryMovieTitle && currentMovie) summaryMovieTitle.textContent = currentMovie.title;
  if (summaryCinema && selectedShowtime) {
    summaryCinema.textContent = `${selectedShowtime.theater_name} | ${formatDate(selectedShowtime.show_date)} at ${formatTime(selectedShowtime.show_time)}`;
  }
  if (summarySeats) {
    summarySeats.textContent = selectedSeats.map(s => s.seat_code).join(', ') + ` (${selectedSeats.length} Tickets)`;
  }

  const seatsSubtotal = selectedSeats.reduce((sum, s) => sum + s.price, 0);
  const snacksTotal = calculateConcessionsTotal();
  const fee = 35.00 * selectedSeats.length;
  const grandTotal = Math.max(0, seatsSubtotal + snacksTotal + fee - appliedDiscount);

  if (summaryTicketsSubtotal) summaryTicketsSubtotal.textContent = formatCurrency(seatsSubtotal);
  if (summaryConcessionsSubtotal) summaryConcessionsSubtotal.textContent = formatCurrency(snacksTotal);
  if (summaryFee) summaryFee.textContent = formatCurrency(fee);

  if (summaryDiscountRow && summaryDiscount) {
    if (appliedDiscount > 0) {
      summaryDiscountRow.style.display = 'flex';
      summaryDiscount.textContent = `-${formatCurrency(appliedDiscount)}`;
    } else {
      summaryDiscountRow.style.display = 'none';
    }
  }

  if (summaryGrandTotal) summaryGrandTotal.textContent = formatCurrency(grandTotal);
}

function applyPromoCode() {
  const input = document.getElementById('promo-code-input');
  if (!input) return;
  const code = input.value.trim().toUpperCase();

  const seatsSubtotal = selectedSeats.reduce((sum, s) => sum + s.price, 0);
  const snacksTotal = calculateConcessionsTotal();

  if (code === 'CINEMA50') {
    appliedDiscount = 50.00;
    appliedPromoCode = 'CINEMA50';
    showToast('Promo code CINEMA50 applied: ₹50 discount!', 'success');
  } else if (code === 'FIRST100') {
    appliedDiscount = 100.00;
    appliedPromoCode = 'FIRST100';
    showToast('Promo code FIRST100 applied: ₹100 discount!', 'success');
  } else if (code === 'VIP20') {
    appliedDiscount = (seatsSubtotal + snacksTotal) * 0.20;
    appliedPromoCode = 'VIP20';
    showToast('VIP20 applied: 20% discount!', 'success');
  } else {
    appliedDiscount = 0;
    appliedPromoCode = null;
    showToast('Invalid promo code. Try CINEMA50 or FIRST100', 'error');
  }

  renderCheckoutSummary();
  updateFloatingBar();
}

function selectPaymentMethod(element, method) {
  document.querySelectorAll('.payment-option').forEach(el => el.classList.remove('active'));
  element.classList.add('active');
  element.dataset.method = method;
}

async function submitBooking() {
  const name = document.getElementById('cust-name')?.value.trim();
  const email = document.getElementById('cust-email')?.value.trim();
  const phone = document.getElementById('cust-phone')?.value.trim();
  const activePaymentEl = document.querySelector('.payment-option.active');
  const paymentMethod = activePaymentEl ? activePaymentEl.dataset.method : 'Credit/Debit Card';

  if (!name || !email || !phone) {
    showToast('Please fill in your name, email, and phone number.', 'error');
    return;
  }

  if (selectedSeats.length === 0) {
    showToast('No seats selected.', 'error');
    return;
  }

  // Format concessions
  const concessionsPayload = [];
  for (const [id, qty] of Object.entries(selectedConcessions)) {
    const item = concessionsList.find(c => c.id == id);
    if (item && qty > 0) {
      concessionsPayload.push({
        id: item.id,
        name: item.name,
        qty,
        price: item.price
      });
    }
  }

  const payload = {
    showtime_id: selectedShowtime.id,
    customer_name: name,
    customer_email: email,
    customer_phone: phone,
    seats: selectedSeats,
    concessions: concessionsPayload,
    promo_code: appliedPromoCode,
    payment_method: paymentMethod
  };

  const btn = document.getElementById('confirm-booking-btn');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing ACID Transaction...`;

  try {
    const res = await CinePassAPI.createBooking(payload);
    if (res.success) {
      showToast('Booking confirmed successfully!', 'success');
      setTimeout(() => {
        window.location.href = `confirmation.html?ref=${encodeURIComponent(res.booking_reference)}`;
      }, 700);
    } else {
      showToast(res.message || 'Booking failed.', 'error');
      btn.disabled = false;
      btn.innerHTML = originalText;

      // If seat collision happened, refresh the seat map
      if (res.message && res.message.includes('collision')) {
        await selectShowtimeById(selectedShowtime.id);
        closeCheckoutModal();
      }
    }
  } catch (err) {
    console.error('Error placing booking:', err);
    showToast('Booking failed due to server error.', 'error');
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

