/**
 * CinePass - Confirmation & Digital E-Ticket Pass
 */

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const ref = urlParams.get('ref');

  if (!ref) {
    showToast('No booking reference provided.', 'error');
    return;
  }

  await loadBookingTicket(ref);
  triggerConfetti();
});

async function loadBookingTicket(ref) {
  try {
    const res = await CinePassAPI.getBookingByRef(ref);
    if (!res.success) {
      showToast('Booking details not found.', 'error');
      return;
    }

    const booking = res.booking;
    renderTicket(booking);
  } catch (err) {
    console.error('Error loading ticket:', err);
    showToast('Failed to load booking ticket.', 'error');
  }
}

function renderTicket(b) {
  document.getElementById('tkt-ref').textContent = b.booking_reference;
  document.getElementById('tkt-title').textContent = b.movie_title;
  document.getElementById('tkt-poster').src = b.movie_poster;
  document.getElementById('tkt-cert').textContent = b.certificate || 'UA';
  document.getElementById('tkt-lang').textContent = b.language || 'English';
  document.getElementById('tkt-screen-type').textContent = b.screen_type || 'IMAX';

  document.getElementById('tkt-theater').textContent = b.theater_name;
  document.getElementById('tkt-address').textContent = b.theater_address;
  document.getElementById('tkt-screen').textContent = b.screen_name;
  document.getElementById('tkt-date').textContent = formatDate(b.show_date);
  document.getElementById('tkt-time').textContent = formatTime(b.show_time);

  document.getElementById('tkt-seats').textContent = b.seats_list;
  document.getElementById('tkt-count').textContent = `${b.seat_count} Ticket(s)`;
  document.getElementById('tkt-name').textContent = b.customer_name;
  document.getElementById('tkt-email').textContent = b.customer_email;
  document.getElementById('tkt-total').textContent = formatCurrency(b.total_amount);
  document.getElementById('tkt-status').textContent = b.booking_status;

  // Concessions
  const snacksBox = document.getElementById('tkt-snacks-box');
  const snacksList = document.getElementById('tkt-snacks-list');
  if (b.concessions_details && snacksBox && snacksList) {
    snacksBox.style.display = 'block';
    snacksList.textContent = b.concessions_details;
  }

  // Generate QR Code
  generateQrCode(b.booking_reference);
}

function generateQrCode(refText) {
  const qrContainer = document.getElementById('ticket-qrcode');
  if (!qrContainer) return;
  qrContainer.innerHTML = '';

  if (typeof QRCode !== 'undefined') {
    new QRCode(qrContainer, {
      text: `CINEPASS-VERIFIED-TKT:${refText}`,
      width: 110,
      height: 110,
      colorDark: '#0b0e14',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });
  } else {
    qrContainer.innerHTML = `<div style="font-family:monospace; font-weight:bold; padding:10px; border:1px solid #000;">[QR: ${refText}]</div>`;
  }
}

function copyReference() {
  const ref = document.getElementById('tkt-ref')?.textContent;
  if (ref) {
    navigator.clipboard.writeText(ref).then(() => {
      showToast('Booking Reference copied to clipboard!', 'success');
    });
  }
}

function printTicket() {
  window.print();
}

function triggerConfetti() {
  if (typeof confetti === 'function') {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
    setTimeout(() => {
      confetti({
        particleCount: 50,
        angle: 60,
        spread: 55,
        origin: { x: 0 }
      });
      confetti({
        particleCount: 50,
        angle: 120,
        spread: 55,
        origin: { x: 1 }
      });
    }, 400);
  }
}

