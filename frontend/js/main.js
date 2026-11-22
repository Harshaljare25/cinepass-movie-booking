/**
 * CinePass - Homepage Logic
 */

let allMovies = [];
let currentFeaturedIndex = 0;
let featuredMovies = [];
let heroTimer = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadMovies();
  setupEventListeners();
});

async function loadMovies() {
  try {
    const res = await CinePassAPI.getMovies();
    if (res.success) {
      allMovies = res.movies;
      featuredMovies = allMovies.filter(m => m.is_featured);
      if (featuredMovies.length === 0) featuredMovies = allMovies.slice(0, 3);

      renderHeroBillboard();
      renderMoviesGrid(allMovies);
    }
  } catch (err) {
    console.error('Failed to load movies:', err);
    showToast('Cannot reach server. Please run "npm start" and visit http://localhost:3000', 'error');

    const grid = document.getElementById('movie-grid');
    if (grid) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 4rem 1.5rem; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed rgba(239, 68, 68, 0.4);">
          <div style="width: 70px; height: 70px; border-radius: 50%; background: rgba(239, 68, 68, 0.15); border: 2px solid #ef4444; color: #ef4444; font-size: 2rem; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem;">
            <i class="fa-solid fa-server"></i>
          </div>
          <h2 style="font-size: 1.6rem; font-weight: 800; margin-bottom: 0.5rem;">Backend Server Connection Needed</h2>
          <p style="color: var(--text-muted); max-width: 520px; margin: 0 auto 1.5rem; font-size: 0.95rem;">
            CinePass connects to a live SQL database. To browse movies, view live seats, and book tickets, the Node.js server must be running.
          </p>
          <div style="background: rgba(0,0,0,0.4); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem; max-width: 440px; margin: 0 auto 1.5rem; text-align: left; font-family: monospace; font-size: 0.9rem;">
            <div style="color: var(--text-dim); margin-bottom: 0.3rem;"># Run in your project directory:</div>
            <div style="color: var(--accent-cyan); font-weight: 700; margin-bottom: 0.8rem;">npm start</div>
            <div style="color: var(--text-dim); margin-bottom: 0.3rem;"># Then open in browser:</div>
            <div style="color: #10b981; font-weight: 700;">http://localhost:3000</div>
          </div>
          <button class="btn btn-primary" onclick="window.location.reload()">
            <i class="fa-solid fa-rotate-right"></i> Retry Connection
          </button>
        </div>
      `;
    }
  }
}

function renderHeroBillboard() {
  if (featuredMovies.length === 0) return;
  const movie = featuredMovies[currentFeaturedIndex];

  const backdrop = document.getElementById('hero-backdrop');
  const title = document.getElementById('hero-title');
  const tagline = document.getElementById('hero-tagline');
  const desc = document.getElementById('hero-desc');
  const cert = document.getElementById('hero-cert');
  const rating = document.getElementById('hero-rating');
  const duration = document.getElementById('hero-duration');
  const lang = document.getElementById('hero-lang');
  const formats = document.getElementById('hero-formats');
  const bookBtn = document.getElementById('hero-book-btn');
  const trailerBtn = document.getElementById('hero-trailer-btn');
  const dotsContainer = document.getElementById('hero-dots');

  if (backdrop) backdrop.style.backgroundImage = `url('${movie.banner_url || movie.poster_url}')`;
  if (title) title.textContent = movie.title;
  if (tagline) tagline.textContent = movie.tagline || '';
  if (desc) desc.textContent = movie.description;
  if (cert) cert.textContent = movie.certificate;
  if (rating) rating.innerHTML = `<i class="fa-solid fa-star"></i> ${movie.rating}`;
  if (duration) duration.innerHTML = `<i class="fa-regular fa-clock"></i> ${movie.duration_mins} mins`;
  if (lang) lang.innerHTML = `<i class="fa-solid fa-globe"></i> ${movie.language}`;
  if (formats) formats.textContent = movie.formats;

  if (bookBtn) {
    bookBtn.href = `booking.html?movieId=${movie.id}`;
  }

  if (trailerBtn) {
    trailerBtn.onclick = () => openTrailerModal(movie.trailer_url, movie.title);
  }

  // Render dots
  if (dotsContainer) {
    dotsContainer.innerHTML = '';
    featuredMovies.forEach((_, idx) => {
      const dot = document.createElement('button');
      dot.className = `hero-dot ${idx === currentFeaturedIndex ? 'active' : ''}`;
      dot.onclick = () => {
        currentFeaturedIndex = idx;
        renderHeroBillboard();
        resetHeroTimer();
      };
      dotsContainer.appendChild(dot);
    });
  }

  resetHeroTimer();
}

function resetHeroTimer() {
  if (heroTimer) clearInterval(heroTimer);
  heroTimer = setInterval(() => {
    currentFeaturedIndex = (currentFeaturedIndex + 1) % featuredMovies.length;
    renderHeroBillboard();
  }, 7000);
}

function renderMoviesGrid(movies) {
  const grid = document.getElementById('movie-grid');
  const countEl = document.getElementById('movies-count');
  if (!grid) return;

  if (countEl) countEl.textContent = `${movies.length} Movies Now Showing`;

  if (movies.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-muted);">
        <i class="fa-solid fa-film" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.5;"></i>
        <h3>No movies found</h3>
        <p>Try searching for a different title or resetting the genre filter.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = movies.map(movie => {
    const formatsList = movie.formats ? movie.formats.split(',').map(f => f.trim()) : ['2D'];
    return `
      <div class="movie-card">
        <div class="movie-poster-wrap">
          <img src="${movie.poster_url}" alt="${movie.title}" class="movie-poster" loading="lazy" />
          <div class="movie-poster-overlay">
            <div class="poster-top-badges">
              <span class="rating-badge"><i class="fa-solid fa-star"></i> ${movie.rating}</span>
              <span class="cert-badge">${movie.certificate}</span>
            </div>
            ${movie.trailer_url ? `
              <button class="trailer-btn-overlay" title="Watch Trailer" onclick="openTrailerModal('${movie.trailer_url}', '${escapeHtml(movie.title)}')">
                <i class="fa-solid fa-play"></i>
              </button>
            ` : ''}
          </div>
        </div>
        <div class="movie-info">
          <h3 class="movie-title" title="${movie.title}">${movie.title}</h3>
          <p class="movie-genre">${movie.genre}</p>
          <div class="movie-meta-row">
            <span><i class="fa-regular fa-clock"></i> ${movie.duration_mins}m</span>
            <span>•</span>
            <span><i class="fa-solid fa-globe"></i> ${movie.language}</span>
          </div>
          <div class="format-tags">
            ${formatsList.map(f => `<span class="format-tag">${f}</span>`).join('')}
          </div>
          <div class="card-actions">
            <a href="booking.html?movieId=${movie.id}" class="btn btn-primary btn-block">
              <i class="fa-solid fa-ticket"></i> Book Tickets
            </a>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function setupEventListeners() {
  // Genre filter pills
  const genrePills = document.querySelectorAll('.genre-pill');
  genrePills.forEach(pill => {
    pill.addEventListener('click', () => {
      genrePills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      filterMovies();
    });
  });

  // Search input
  const searchInput = document.getElementById('search-movies-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      filterMovies();
    });
  }

  // Format filter dropdown
  const formatSelect = document.getElementById('format-filter-select');
  if (formatSelect) {
    formatSelect.addEventListener('change', () => {
      filterMovies();
    });
  }
}

function filterMovies() {
  const activeGenre = document.querySelector('.genre-pill.active')?.dataset.genre || 'All';
  const searchTerm = document.getElementById('search-movies-input')?.value.toLowerCase().trim() || '';
  const formatSelect = document.getElementById('format-filter-select')?.value || 'All';

  const filtered = allMovies.filter(movie => {
    const matchesGenre = activeGenre === 'All' || movie.genre.toLowerCase().includes(activeGenre.toLowerCase());
    const matchesSearch = !searchTerm ||
      movie.title.toLowerCase().includes(searchTerm) ||
      (movie.cast && movie.cast.toLowerCase().includes(searchTerm)) ||
      (movie.director && movie.director.toLowerCase().includes(searchTerm));
    const matchesFormat = formatSelect === 'All' || (movie.formats && movie.formats.includes(formatSelect));

    return matchesGenre && matchesSearch && matchesFormat;
  });

  renderMoviesGrid(filtered);
}

// Trailer Modal Functions
function openTrailerModal(trailerUrl, movieTitle) {
  if (!trailerUrl) {
    showToast('Trailer not available for this movie.', 'info');
    return;
  }
  const modal = document.getElementById('trailer-modal');
  const iframe = document.getElementById('trailer-iframe');
  const titleEl = document.getElementById('trailer-title');

  if (iframe) iframe.src = trailerUrl + '?autoplay=1';
  if (titleEl) titleEl.textContent = movieTitle;
  if (modal) modal.classList.add('show');
}

function closeTrailerModal() {
  const modal = document.getElementById('trailer-modal');
  const iframe = document.getElementById('trailer-iframe');
  if (iframe) iframe.src = '';
  if (modal) modal.classList.remove('show');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'");
}

