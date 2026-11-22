/**
 * CinePass - Admin Portal & Live SQL Console Engine
 */

let lastSqlResult = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadDashboardData();
  setupTabNavigation();
  setupAddMovieForm();
});

async function loadDashboardData() {
  try {
    const res = await CinePassAPI.getAdminStats();
    if (!res.success) {
      showToast('Failed to load admin stats.', 'error');
      return;
    }

    const { stats, topMovies, recentBookings } = res;

    // Stat KPI cards
    document.getElementById('stat-revenue').textContent = formatCurrency(stats.total_revenue);
    document.getElementById('stat-tickets').textContent = stats.total_tickets_sold.toLocaleString();
    document.getElementById('stat-bookings').textContent = stats.total_confirmed_bookings.toLocaleString();
    document.getElementById('stat-shows').textContent = stats.active_showtimes.toLocaleString();

    // Top Movies
    renderTopMovies(topMovies);

    // Recent Bookings
    renderRecentBookings(recentBookings);
  } catch (err) {
    console.error('Error loading admin data:', err);
    showToast('Failed to connect to database.', 'error');
  }
}

function renderTopMovies(movies) {
  const container = document.getElementById('top-movies-list');
  if (!container) return;

  if (movies.length === 0) {
    container.innerHTML = `<p style="color:var(--text-muted); padding:1rem;">No movie revenue data yet.</p>`;
    return;
  }

  container.innerHTML = movies.map((m, idx) => `
    <div style="display:flex; align-items:center; justify-content:space-between; padding:0.8rem 1rem; border-bottom:1px solid rgba(255,255,255,0.05);">
      <div style="display:flex; align-items:center; gap:0.75rem;">
        <span style="font-weight:800; color:var(--accent-red); font-size:1.1rem; width:20px;">#${idx + 1}</span>
        <img src="${m.poster_url}" alt="${m.title}" style="width:36px; height:50px; object-fit:cover; border-radius:4px;" />
        <div>
          <h4 style="font-size:0.95rem; font-weight:700;">${m.title}</h4>
          <span style="font-size:0.75rem; color:var(--text-muted);">${m.bookings_count} bookings placed</span>
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-weight:800; color:#fff; font-size:1rem;">${formatCurrency(m.movie_revenue)}</div>
      </div>
    </div>
  `).join('');
}

function renderRecentBookings(bookings) {
  const tbody = document.getElementById('admin-bookings-tbody');
  if (!tbody) return;

  if (bookings.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">No bookings placed yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = bookings.map(b => {
    const isCancelled = b.booking_status === 'CANCELLED';
    return `
      <tr>
        <td><code>${b.booking_reference}</code></td>
        <td>
          <div style="font-weight:600;">${b.customer_name}</div>
          <div style="font-size:0.75rem; color:var(--text-dim);">${b.customer_email}</div>
        </td>
        <td>${b.movie_title}</td>
        <td><span class="badge-pill" style="background:#1e2638; border:1px solid #33405c;">${b.seats_list}</span></td>
        <td style="font-weight:700;">${formatCurrency(b.total_amount)}</td>
        <td>
          <span class="status-badge ${isCancelled ? 'cancelled' : 'confirmed'}">
            ${b.booking_status}
          </span>
        </td>
        <td>
          ${!isCancelled ? `
            <button class="btn btn-outline btn-sm" onclick="cancelFromAdmin(${b.id})" style="border-color:#ef4444; color:#ef4444; padding:0.25rem 0.6rem; font-size:0.75rem;">
              Cancel
            </button>
          ` : '<span style="font-size:0.75rem; color:var(--text-dim);">Refunded</span>'}
        </td>
      </tr>
    `;
  }).join('');
}

async function cancelFromAdmin(bookingId) {
  if (!confirm(`Are you sure you want to cancel booking #${bookingId} and release seats in MySQL?`)) return;

  try {
    const res = await CinePassAPI.cancelBooking(bookingId);
    if (res.success) {
      showToast('Booking cancelled & seats released.', 'success');
      await loadDashboardData();
    } else {
      showToast(res.message, 'error');
    }
  } catch (err) {
    showToast('Failed to cancel.', 'error');
  }
}

// ===================================================================
// Tab Navigation
// ===================================================================
function setupTabNavigation() {
  const tabs = document.querySelectorAll('.admin-tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.admin-tab-content').forEach(c => c.style.display = 'none');

      tab.classList.add('active');
      const targetId = tab.dataset.tab;
      const targetEl = document.getElementById(targetId);
      if (targetEl) targetEl.style.display = 'block';
    });
  });
}

// ===================================================================
// Add Movie Form
// ===================================================================
function setupAddMovieForm() {
  const form = document.getElementById('add-movie-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const movieData = {
      title: document.getElementById('m-title').value.trim(),
      tagline: document.getElementById('m-tagline').value.trim(),
      genre: document.getElementById('m-genre').value.trim(),
      duration_mins: parseInt(document.getElementById('m-duration').value, 10),
      rating: parseFloat(document.getElementById('m-rating').value),
      certificate: document.getElementById('m-cert').value,
      language: document.getElementById('m-lang').value,
      formats: document.getElementById('m-formats').value,
      director: document.getElementById('m-director').value.trim(),
      cast: document.getElementById('m-cast').value.trim(),
      poster_url: document.getElementById('m-poster').value.trim(),
      banner_url: document.getElementById('m-banner').value.trim() || document.getElementById('m-poster').value.trim(),
      trailer_url: document.getElementById('m-trailer').value.trim(),
      description: document.getElementById('m-desc').value.trim()
    };

    const submitBtn = document.getElementById('add-movie-submit-btn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving to MySQL...`;

    try {
      const res = await CinePassAPI.addMovie(movieData);
      if (res.success) {
        showToast(res.message, 'success');
        form.reset();
        await loadDashboardData();
      } else {
        showToast(res.message || 'Failed to add movie.', 'error');
      }
    } catch (err) {
      showToast('Server error while saving movie.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i class="fa-solid fa-plus"></i> Add Movie & Generate Showtimes`;
    }
  });
}

// ===================================================================
// Live SQL Query Sandbox Runner
// ===================================================================
async function runSQLQuery() {
  const editor = document.getElementById('sql-editor');
  const metricsBox = document.getElementById('sql-metrics');
  const resultsBox = document.getElementById('sql-results-table');
  const errorBox = document.getElementById('sql-error-box');

  if (!editor) return;
  const query = editor.value.trim();

  if (!query) {
    showToast('Please type an SQL query to execute.', 'info');
    return;
  }

  if (errorBox) errorBox.style.display = 'none';
  if (resultsBox) resultsBox.innerHTML = `<div style="text-align:center; padding:2rem;"><i class="fa-solid fa-spinner fa-spin" style="font-size:2rem; color:#58a6ff;"></i><p style="margin-top:0.5rem; color:var(--text-muted);">Executing query on live database...</p></div>`;

  try {
    const res = await CinePassAPI.executeSQL(query);

    if (!res.success) {
      if (errorBox) {
        errorBox.textContent = res.message;
        errorBox.style.display = 'block';
      }
      if (resultsBox) resultsBox.innerHTML = '';
      return;
    }

    lastSqlResult = {
      query,
      columns: res.columns,
      rows: res.rows,
      rowCount: res.rowCount,
      executionTimeMs: res.executionTimeMs
    };

    // Render Metrics & Download Actions
    if (metricsBox) {
      metricsBox.innerHTML = `
        <div style="display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;">
          <span><i class="fa-solid fa-bolt" style="color:var(--accent-gold);"></i> Execution Time: <strong>${res.executionTimeMs} ms</strong></span>
          <span>•</span>
          <span><i class="fa-solid fa-table-list" style="color:var(--accent-cyan);"></i> Rows: <strong>${res.rowCount}</strong></span>
          <span>•</span>
          <span><i class="fa-solid fa-columns"></i> Columns: <strong>${res.columns.length}</strong></span>
        </div>
        <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin-top: 0.5rem;">
          <button class="btn btn-primary btn-sm" onclick="downloadDatabaseSQL()" title="Download entire live MySQL database as a .sql dump file">
            <i class="fa-solid fa-file-arrow-down"></i> Download SQL DB File (.sql)
          </button>
          <button class="btn btn-secondary btn-sm" onclick="downloadQueryResultSQL()" title="Export this query result as .sql insert statements">
            <i class="fa-solid fa-file-code"></i> Export Result as .sql
          </button>
          <button class="btn btn-secondary btn-sm" onclick="downloadQueryResultCSV()" title="Export this query result as CSV file">
            <i class="fa-solid fa-file-csv"></i> Export CSV
          </button>
        </div>
      `;
    }

    // Render Table
    if (res.rows.length === 0) {
      resultsBox.innerHTML = `<div style="padding:1.5rem; text-align:center; color:var(--text-muted);">Query executed successfully. 0 rows returned.</div>`;
      return;
    }

    let tableHtml = `<div class="table-responsive"><table class="admin-table"><thead><tr>`;
    res.columns.forEach(col => {
      tableHtml += `<th>${col}</th>`;
    });
    tableHtml += `</tr></thead><tbody>`;

    res.rows.forEach(row => {
      tableHtml += `<tr>`;
      res.columns.forEach(col => {
        let val = row[col];
        if (val === null || val === undefined) val = `<span style="color:var(--text-dim); font-style:italic;">NULL</span>`;
        else if (typeof val === 'object') val = JSON.stringify(val);
        tableHtml += `<td>${val}</td>`;
      });
      tableHtml += `</tr>`;
    });

    tableHtml += `</tbody></table></div>`;
    resultsBox.innerHTML = tableHtml;
  } catch (err) {
    if (errorBox) {
      errorBox.textContent = 'Network or server error while running SQL query.';
      errorBox.style.display = 'block';
    }
  }
}

function setSampleQuery(query) {
  const editor = document.getElementById('sql-editor');
  if (editor) {
    editor.value = query;
    runSQLQuery();
  }
}

async function cleanDemoDataAdmin() {
  if (!confirm('Are you sure you want to delete all demo/test bookings? This will reset all booked seats back to available and set revenue to ₹0 for live deployment.')) {
    return;
  }

  try {
    const res = await CinePassAPI.cleanDemoData();
    if (res.success) {
      showToast(res.message, 'success');
      await loadDashboardData();
    } else {
      showToast(res.message || 'Failed to clean demo data.', 'error');
    }
  } catch (err) {
    showToast('Failed to clean demo data.', 'error');
  }
}

// ===================================================================
// SQL Export & Download Functions
// ===================================================================

/**
 * Downloads the complete live database as a .sql dump file
 */
function downloadDatabaseSQL() {
  showToast('Preparing live database SQL dump...', 'info');
  const downloadLink = document.createElement('a');
  downloadLink.href = '/api/admin/export-sql';
  downloadLink.download = `cinepass_database_${Date.now()}.sql`;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();
}

/**
 * Downloads the current query results as an .sql file
 */
function downloadQueryResultSQL() {
  if (!lastSqlResult || !lastSqlResult.rows || lastSqlResult.rows.length === 0) {
    showToast('No query result data to export. Execute a query first.', 'info');
    return;
  }

  const { columns, rows, query } = lastSqlResult;
  let sqlContent = `-- =======================================================\n`;
  sqlContent += `-- CinePass Query Result Export\n`;
  sqlContent += `-- Query: ${query.replace(/\n/g, ' ')}\n`;
  sqlContent += `-- Rows: ${rows.length} | Date: ${new Date().toISOString()}\n`;
  sqlContent += `-- =======================================================\n\n`;

  sqlContent += `INSERT INTO query_export (${columns.map(c => `\`${c}\``).join(', ')}) VALUES\n`;
  const valRows = rows.map(r => {
    const vals = columns.map(c => {
      const val = r[c];
      if (val === null || val === undefined) return 'NULL';
      if (typeof val === 'number') return val;
      return `'${String(val).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    });
    return `  (${vals.join(', ')})`;
  });

  sqlContent += valRows.join(',\n') + ';\n';

  const blob = new Blob([sqlContent], { type: 'application/sql;charset=utf-8;' });
  triggerClientDownload(blob, `query_result_${Date.now()}.sql`);
  showToast('Query results exported as .sql file!', 'success');
}

/**
 * Downloads the current query results as a CSV file
 */
function downloadQueryResultCSV() {
  if (!lastSqlResult || !lastSqlResult.rows || lastSqlResult.rows.length === 0) {
    showToast('No query result data to export.', 'info');
    return;
  }

  const { columns, rows } = lastSqlResult;
  let csv = columns.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',') + '\n';

  rows.forEach(r => {
    const rowVals = columns.map(c => {
      const val = r[c] !== null && r[c] !== undefined ? String(r[c]) : '';
      return `"${val.replace(/"/g, '""')}"`;
    });
    csv += rowVals.join(',') + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  triggerClientDownload(blob, `query_result_${Date.now()}.csv`);
  showToast('Query results exported as CSV!', 'success');
}

function triggerClientDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

