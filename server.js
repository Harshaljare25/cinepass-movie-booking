const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeDatabase, getPool, dbConfig, cleanDemoData } = require('./db/connection');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// -------------------------------------------------------------
// Database Health & Status Endpoint
// -------------------------------------------------------------
app.get('/api/status', async (req, res) => {
  try {
    const pool = getPool();
    const startTime = Date.now();
    const [result] = await pool.query('SELECT NOW() as server_time, VERSION() as version');
    const latencyMs = Date.now() - startTime;

    // Table counts
    const [movieCount] = await pool.query('SELECT COUNT(*) as count FROM movies');
    const [bookingCount] = await pool.query('SELECT COUNT(*) as count FROM bookings');
    const [showtimeCount] = await pool.query('SELECT COUNT(*) as count FROM showtimes WHERE show_date >= CURDATE()');

    res.json({
      status: 'online',
      database: dbConfig.database,
      host: dbConfig.host,
      port: dbConfig.port,
      mysql_version: result[0].version,
      server_time: result[0].server_time,
      latency_ms: latencyMs,
      metrics: {
        movies: movieCount[0].count,
        bookings: bookingCount[0].count,
        upcoming_shows: showtimeCount[0].count
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// -------------------------------------------------------------
// Movies Endpoints
// -------------------------------------------------------------
// GET /api/movies - list all movies with optional genre/search filters
app.get('/api/movies', async (req, res) => {
  try {
    const pool = getPool();
    const { genre, search, featured } = req.query;

    let query = 'SELECT * FROM movies WHERE is_now_showing = TRUE';
    const params = [];

    if (genre && genre !== 'All') {
      query += ' AND genre LIKE ?';
      params.push(`%${genre}%`);
    }

    if (search && search.trim() !== '') {
      query += ' AND (title LIKE ? OR cast LIKE ? OR director LIKE ?)';
      params.push(`%${search.trim()}%`, `%${search.trim()}%`, `%${search.trim()}%`);
    }

    if (featured === 'true') {
      query += ' AND is_featured = TRUE';
    }

    query += ' ORDER BY rating DESC, id ASC';

    const [movies] = await pool.query(query, params);
    res.json({ success: true, count: movies.length, movies });
  } catch (error) {
    console.error('Error fetching movies:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve movies.' });
  }
});

// GET /api/movies/:id - Get specific movie with all theaters and showtimes
app.get('/api/movies/:id', async (req, res) => {
  try {
    const pool = getPool();
    const movieId = req.params.id;

    const [movieRows] = await pool.query('SELECT * FROM movies WHERE id = ?', [movieId]);
    if (movieRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Movie not found.' });
    }
    const movie = movieRows[0];

    // Fetch upcoming showtimes for this movie
    const [showtimes] = await pool.query(`
      SELECT 
        s.id as showtime_id,
        s.show_date,
        s.show_time,
        s.price_standard,
        s.price_premium,
        s.price_vip,
        s.status,
        t.id as theater_id,
        t.name as theater_name,
        t.address as theater_address,
        t.amenities as theater_amenities,
        sc.id as screen_id,
        sc.screen_name,
        sc.screen_type,
        sc.total_seats
      FROM showtimes s
      JOIN theaters t ON s.theater_id = t.id
      JOIN screens sc ON s.screen_id = sc.id
      WHERE s.movie_id = ? AND s.show_date >= CURDATE()
      ORDER BY s.show_date ASC, t.name ASC, s.show_time ASC
    `, [movieId]);

    res.json({ success: true, movie, showtimes });
  } catch (error) {
    console.error('Error fetching movie details:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve movie details.' });
  }
});

// -------------------------------------------------------------
// Showtime & Seat Map Endpoint
// -------------------------------------------------------------
// GET /api/showtimes/:id - Showtime details + complete live seat layout & booked seats
app.get('/api/showtimes/:id', async (req, res) => {
  try {
    const pool = getPool();
    const showtimeId = req.params.id;

    // 1. Get showtime details
    const [showRows] = await pool.query(`
      SELECT 
        s.id,
        s.show_date,
        s.show_time,
        s.price_standard,
        s.price_premium,
        s.price_vip,
        s.status,
        m.id as movie_id,
        m.title as movie_title,
        m.poster_url as movie_poster,
        m.certificate,
        m.language,
        m.duration_mins,
        t.id as theater_id,
        t.name as theater_name,
        t.address as theater_address,
        sc.id as screen_id,
        sc.screen_name,
        sc.screen_type,
        sc.rows_count,
        sc.cols_count,
        sc.total_seats
      FROM showtimes s
      JOIN movies m ON s.movie_id = m.id
      JOIN theaters t ON s.theater_id = t.id
      JOIN screens sc ON s.screen_id = sc.id
      WHERE s.id = ?
    `, [showtimeId]);

    if (showRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Showtime not found.' });
    }

    const showtime = showRows[0];

    // 2. Get all physical seats for this screen
    const [seats] = await pool.query(`
      SELECT id, row_label, seat_number, seat_code, tier, base_price_factor
      FROM seats
      WHERE screen_id = ?
      ORDER BY row_label DESC, seat_number ASC
    `, [showtime.screen_id]);

    // 3. Get currently booked seat codes for this showtime (only active bookings)
    const [bookedRows] = await pool.query(`
      SELECT bs.seat_code
      FROM booking_seats bs
      JOIN bookings b ON bs.booking_id = b.id
      WHERE bs.showtime_id = ? AND b.booking_status != 'CANCELLED'
    `, [showtimeId]);

    const bookedSeatCodes = bookedRows.map(r => r.seat_code);

    // Calculate real-time price per tier for this specific showtime
    const seatMap = seats.map(seat => {
      let price = showtime.price_standard;
      if (seat.tier === 'PREMIUM') price = showtime.price_premium;
      if (seat.tier === 'VIP') price = showtime.price_vip;

      return {
        ...seat,
        price,
        is_booked: bookedSeatCodes.includes(seat.seat_code)
      };
    });

    res.json({
      success: true,
      showtime,
      seatMap,
      bookedSeatCodes,
      total_seats: seats.length,
      available_seats: seats.length - bookedSeatCodes.length
    });
  } catch (error) {
    console.error('Error fetching showtime details:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve showtime details.' });
  }
});

// -------------------------------------------------------------
// Concessions / Food & Beverages Endpoint
// -------------------------------------------------------------
app.get('/api/concessions', async (req, res) => {
  try {
    const pool = getPool();
    const [items] = await pool.query('SELECT * FROM concessions ORDER BY category ASC, price ASC');
    res.json({ success: true, concessions: items });
  } catch (error) {
    console.error('Error fetching concessions:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve food & beverage items.' });
  }
});

// -------------------------------------------------------------
// Bookings Endpoints (ACID Transaction)
// -------------------------------------------------------------
// POST /api/bookings - Place a booking with ACID consistency
app.post('/api/bookings', async (req, res) => {
  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    const {
      showtime_id,
      customer_name,
      customer_email,
      customer_phone,
      seats, // array of { seat_code, tier, price }
      concessions, // array of { id, name, qty, price }
      promo_code,
      payment_method
    } = req.body;

    if (!showtime_id || !customer_name || !customer_email || !customer_phone || !seats || seats.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request: Please provide all customer details and select at least one seat.'
      });
    }

    // Start SQL Transaction
    await conn.beginTransaction();

    // 1. Verify showtime exists
    const [showRows] = await conn.query('SELECT id, show_date, show_time FROM showtimes WHERE id = ? FOR UPDATE', [showtime_id]);
    if (showRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Showtime not found.' });
    }

    // 2. Check for seat conflicts (Live atomic check with row locking)
    const seatCodes = seats.map(s => s.seat_code);
    const [existingBookings] = await conn.query(`
      SELECT bs.seat_code
      FROM booking_seats bs
      JOIN bookings b ON bs.booking_id = b.id
      WHERE bs.showtime_id = ? 
        AND bs.seat_code IN (?)
        AND b.booking_status != 'CANCELLED'
      FOR UPDATE
    `, [showtime_id, seatCodes]);

    if (existingBookings.length > 0) {
      await conn.rollback();
      const conflictSeats = existingBookings.map(b => b.seat_code).join(', ');
      return res.status(409).json({
        success: false,
        message: `Seat collision: Seat(s) ${conflictSeats} have just been booked by another user. Please select other seats.`
      });
    }

    // 3. Compute calculations
    let subtotal = 0;
    for (const seat of seats) {
      subtotal += parseFloat(seat.price);
    }

    let concessionsTotal = 0;
    let concessionsSummary = [];
    if (concessions && Array.isArray(concessions)) {
      for (const item of concessions) {
        if (item.qty > 0) {
          const itemTotal = parseFloat(item.price) * item.qty;
          concessionsTotal += itemTotal;
          concessionsSummary.push(`${item.name} x${item.qty} (₹${itemTotal.toFixed(2)})`);
        }
      }
    }

    const convenienceFee = 35.00 * seats.length;

    // Apply promo discounts
    let discount = 0;
    if (promo_code) {
      const codeUpper = promo_code.trim().toUpperCase();
      if (codeUpper === 'CINEMA50') {
        discount = 50.00;
      } else if (codeUpper === 'FIRST100') {
        discount = 100.00;
      } else if (codeUpper === 'VIP20') {
        discount = (subtotal + concessionsTotal) * 0.20;
      }
    }

    const totalAmount = Math.max(0, subtotal + convenienceFee + concessionsTotal - discount);

    // 4. Generate unique booking reference: e.g. CP-82914
    const bookingRef = `CP-${Date.now().toString().slice(-4)}${Math.floor(1000 + Math.random() * 9000)}`;

    // 5. Insert into bookings table
    const [bookingResult] = await conn.query(`
      INSERT INTO bookings (
        booking_reference,
        showtime_id,
        customer_name,
        customer_email,
        customer_phone,
        seat_count,
        seats_list,
        subtotal_amount,
        convenience_fee,
        discount_amount,
        promo_code,
        concessions_amount,
        concessions_details,
        total_amount,
        payment_method,
        payment_status,
        booking_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PAID', 'CONFIRMED')
    `, [
      bookingRef,
      showtime_id,
      customer_name,
      customer_email,
      customer_phone,
      seats.length,
      seatCodes.join(', '),
      subtotal,
      convenienceFee,
      discount,
      promo_code || null,
      concessionsTotal,
      concessionsSummary.join(' | ') || null,
      totalAmount,
      payment_method || 'Credit/Debit Card'
    ]);

    const bookingId = bookingResult.insertId;

    // 6. Insert individual seats into booking_seats
    for (const seat of seats) {
      await conn.query(`
        INSERT INTO booking_seats (booking_id, showtime_id, seat_code, tier, price)
        VALUES (?, ?, ?, ?, ?)
      `, [bookingId, showtime_id, seat.seat_code, seat.tier || 'STANDARD', seat.price]);
    }

    // Commit Transaction
    await conn.commit();

    console.log(`[SQL DB] Live booking created! Ref: ${bookingRef}, Seats: ${seatCodes.join(', ')}, Total: ₹${totalAmount}`);

    res.json({
      success: true,
      message: 'Booking confirmed successfully!',
      booking_id: bookingId,
      booking_reference: bookingRef,
      total_amount: totalAmount
    });
  } catch (error) {
    await conn.rollback();
    console.error('Error in booking transaction:', error);
    res.status(500).json({ success: false, message: 'Database transaction failed: ' + error.message });
  } finally {
    conn.release();
  }
});

// GET /api/bookings - Search or list all bookings (with search filters)
app.get('/api/bookings', async (req, res) => {
  try {
    const pool = getPool();
    const { ref, email, phone } = req.query;

    let query = `
      SELECT 
        b.*,
        m.title as movie_title,
        m.poster_url as movie_poster,
        m.certificate,
        t.name as theater_name,
        sc.screen_name,
        sc.screen_type,
        s.show_date,
        s.show_time
      FROM bookings b
      JOIN showtimes s ON b.showtime_id = s.id
      JOIN movies m ON s.movie_id = m.id
      JOIN theaters t ON s.theater_id = t.id
      JOIN screens sc ON s.screen_id = sc.id
      WHERE 1=1
    `;
    const params = [];

    if (ref) {
      query += ' AND b.booking_reference = ?';
      params.push(ref.trim());
    }
    if (email) {
      query += ' AND b.customer_email LIKE ?';
      params.push(`%${email.trim()}%`);
    }
    if (phone) {
      query += ' AND b.customer_phone LIKE ?';
      params.push(`%${phone.trim()}%`);
    }

    query += ' ORDER BY b.id DESC LIMIT 50';

    const [bookings] = await pool.query(query, params);
    res.json({ success: true, count: bookings.length, bookings });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve bookings.' });
  }
});

// GET /api/bookings/:ref - Get detailed booking by Reference Code
app.get('/api/bookings/ref/:ref', async (req, res) => {
  try {
    const pool = getPool();
    const ref = req.params.ref.trim();

    const [bookings] = await pool.query(`
      SELECT 
        b.*,
        m.title as movie_title,
        m.poster_url as movie_poster,
        m.banner_url as movie_banner,
        m.certificate,
        m.duration_mins,
        m.language,
        t.name as theater_name,
        t.address as theater_address,
        sc.screen_name,
        sc.screen_type,
        s.show_date,
        s.show_time
      FROM bookings b
      JOIN showtimes s ON b.showtime_id = s.id
      JOIN movies m ON s.movie_id = m.id
      JOIN theaters t ON s.theater_id = t.id
      JOIN screens sc ON s.screen_id = sc.id
      WHERE b.booking_reference = ?
    `, [ref]);

    if (bookings.length === 0) {
      return res.status(404).json({ success: false, message: 'Booking reference not found.' });
    }

    const booking = bookings[0];

    // Fetch individual seats booked
    const [seats] = await pool.query(`
      SELECT seat_code, tier, price FROM booking_seats WHERE booking_id = ?
    `, [booking.id]);

    res.json({ success: true, booking: { ...booking, seat_details: seats } });
  } catch (error) {
    console.error('Error fetching booking by reference:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve booking.' });
  }
});

// POST /api/bookings/:id/cancel - Cancel booking and immediately release seats in database
app.post('/api/bookings/:id/cancel', async (req, res) => {
  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    const bookingId = req.params.id;

    await conn.beginTransaction();

    const [bookingRows] = await conn.query('SELECT * FROM bookings WHERE id = ? FOR UPDATE', [bookingId]);
    if (bookingRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    const booking = bookingRows[0];
    if (booking.booking_status === 'CANCELLED') {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'This booking is already cancelled.' });
    }

    // Mark booking status as CANCELLED and refunded
    await conn.query(`
      UPDATE bookings 
      SET booking_status = 'CANCELLED', payment_status = 'REFUNDED'
      WHERE id = ?
    `, [bookingId]);

    // Delete booking_seats to instantly release the seats on the live map
    await conn.query('DELETE FROM booking_seats WHERE booking_id = ?', [bookingId]);

    await conn.commit();
    console.log(`[SQL DB] Booking #${bookingId} (${booking.booking_reference}) successfully cancelled. Seats released.`);

    res.json({
      success: true,
      message: 'Booking cancelled successfully. Seats have been released and refund initiated.'
    });
  } catch (error) {
    await conn.rollback();
    console.error('Error cancelling booking:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel booking.' });
  } finally {
    conn.release();
  }
});

// -------------------------------------------------------------
// Admin Analytics & Management Endpoints
// -------------------------------------------------------------
app.get('/api/admin/stats', async (req, res) => {
  try {
    const pool = getPool();

    // 1. Total confirmed revenue
    const [revResult] = await pool.query(`
      SELECT 
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COALESCE(SUM(seat_count), 0) as total_tickets_sold,
        COUNT(*) as total_confirmed_bookings
      FROM bookings 
      WHERE booking_status = 'CONFIRMED'
    `);

    // 2. Cancelled count
    const [cancelResult] = await pool.query(`
      SELECT COUNT(*) as cancelled_count FROM bookings WHERE booking_status = 'CANCELLED'
    `);

    // 3. Top movies by bookings
    const [topMovies] = await pool.query(`
      SELECT 
        m.id,
        m.title,
        m.poster_url,
        COUNT(b.id) as bookings_count,
        COALESCE(SUM(b.total_amount), 0) as movie_revenue
      FROM movies m
      LEFT JOIN showtimes s ON m.id = s.movie_id
      LEFT JOIN bookings b ON s.id = b.showtime_id AND b.booking_status = 'CONFIRMED'
      GROUP BY m.id, m.title, m.poster_url
      ORDER BY movie_revenue DESC
      LIMIT 5
    `);

    // 4. Recent bookings list
    const [recentBookings] = await pool.query(`
      SELECT 
        b.id,
        b.booking_reference,
        b.customer_name,
        b.customer_email,
        b.seats_list,
        b.seat_count,
        b.total_amount,
        b.payment_method,
        b.booking_status,
        b.booking_date,
        m.title as movie_title,
        t.name as theater_name
      FROM bookings b
      JOIN showtimes s ON b.showtime_id = s.id
      JOIN movies m ON s.movie_id = m.id
      JOIN theaters t ON s.theater_id = t.id
      ORDER BY b.id DESC
      LIMIT 10
    `);

    // 5. Total counts
    const [moviesCount] = await pool.query('SELECT COUNT(*) as count FROM movies');
    const [theatersCount] = await pool.query('SELECT COUNT(*) as count FROM theaters');
    const [showtimesCount] = await pool.query('SELECT COUNT(*) as count FROM showtimes WHERE show_date >= CURDATE()');

    res.json({
      success: true,
      stats: {
        total_revenue: revResult[0].total_revenue,
        total_tickets_sold: revResult[0].total_tickets_sold,
        total_confirmed_bookings: revResult[0].total_confirmed_bookings,
        cancelled_bookings: cancelResult[0].cancelled_count,
        total_movies: moviesCount[0].count,
        total_theaters: theatersCount[0].count,
        active_showtimes: showtimesCount[0].count
      },
      topMovies,
      recentBookings
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve admin stats.' });
  }
});

// POST /api/admin/movies - Admin add new movie
app.post('/api/admin/movies', async (req, res) => {
  try {
    const pool = getPool();
    const {
      title,
      tagline,
      description,
      genre,
      duration_mins,
      rating,
      certificate,
      language,
      formats,
      director,
      cast,
      poster_url,
      banner_url,
      trailer_url
    } = req.body;

    if (!title || !genre || !duration_mins || !poster_url) {
      return res.status(400).json({ success: false, message: 'Title, genre, duration and poster are required.' });
    }

    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const [result] = await pool.query(`
      INSERT INTO movies (
        title, slug, tagline, description, genre, duration_mins, rating,
        certificate, language, formats, director, cast, poster_url, banner_url,
        trailer_url, is_featured, is_now_showing
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, TRUE)
    `, [
      title,
      slug,
      tagline || 'Experience it in theatres',
      description || 'An exciting new cinema presentation.',
      genre,
      parseInt(duration_mins, 10),
      parseFloat(rating || 8.0),
      certificate || 'UA',
      language || 'English',
      formats || '2D, 3D, IMAX',
      director || 'Renowned Filmmaker',
      cast || 'Starring Cast',
      poster_url,
      banner_url || poster_url,
      trailer_url || ''
    ]);

    const newMovieId = result.insertId;

    // Automatically generate showtimes for this new movie for the next 4 days across existing screens!
    const [screens] = await pool.query('SELECT id, theater_id FROM screens LIMIT 3');
    const times = ['11:00:00', '15:30:00', '19:45:00'];
    for (let d = 0; d <= 3; d++) {
      for (const sc of screens) {
        const time = times[(sc.id + d) % times.length];
        await pool.query(`
          INSERT INTO showtimes (movie_id, theater_id, screen_id, show_date, show_time, price_standard, price_premium, price_vip, status)
          VALUES (?, ?, ?, DATE_ADD(CURDATE(), INTERVAL ? DAY), ?, 250.00, 380.00, 550.00, 'ACTIVE')
        `, [newMovieId, sc.theater_id, sc.id, d, time]);
      }
    }

    res.json({
      success: true,
      message: `Movie "${title}" added successfully with auto-generated showtimes!`,
      movie_id: newMovieId
    });
  } catch (error) {
    console.error('Error adding movie:', error);
    res.status(500).json({ success: false, message: 'Failed to add movie: ' + error.message });
  }
});

// POST /api/admin/sql - Live SQL Query Sandbox (Execute custom read-only SQL queries to demonstrate the live database)
app.post('/api/admin/sql', async (req, res) => {
  try {
    const pool = getPool();
    const { query } = req.body;

    if (!query || query.trim() === '') {
      return res.status(400).json({ success: false, message: 'Please provide an SQL query.' });
    }

    const trimmed = query.trim();
    // Allow safe inspection queries
    const allowedPrefixes = ['SELECT', 'SHOW', 'DESCRIBE', 'DESC', 'EXPLAIN'];
    const isAllowed = allowedPrefixes.some(prefix => trimmed.toUpperCase().startsWith(prefix));

    if (!isAllowed) {
      return res.status(403).json({
        success: false,
        message: 'Security Notice: For safety in the live demo sandbox, only SELECT, SHOW, DESCRIBE, and EXPLAIN queries are permitted.'
      });
    }

    const startTime = Date.now();
    const [rows, fields] = await pool.query(trimmed);
    const executionTimeMs = Date.now() - startTime;

    const columnNames = fields ? fields.map(f => f.name) : (rows.length > 0 ? Object.keys(rows[0]) : []);

    res.json({
      success: true,
      columns: columnNames,
      rows: Array.isArray(rows) ? rows : [rows],
      rowCount: Array.isArray(rows) ? rows.length : 1,
      executionTimeMs
    });
  } catch (error) {
    console.error('SQL Sandbox error:', error);
    res.status(400).json({ success: false, message: 'SQL Execution Error: ' + error.message });
  }
});

// POST /api/admin/clean-demo - Completely wipe all test/demo bookings and release all seats
app.post('/api/admin/clean-demo', async (req, res) => {
  try {
    const result = await cleanDemoData();
    res.json({ success: true, message: result.message });
  } catch (error) {
    console.error('Error cleaning demo bookings:', error);
    res.status(500).json({ success: false, message: 'Failed to clean demo bookings: ' + error.message });
  }
});

// GET /api/admin/export-sql - Generate and download complete live SQL database file (.sql)
app.get('/api/admin/export-sql', async (req, res) => {
  try {
    const pool = getPool();
    const [tables] = await pool.query('SHOW TABLES');
    
    let tableNames = [];
    if (tables && tables.length > 0) {
      const tableKey = Object.keys(tables[0])[0];
      tableNames = tables.map(t => t[tableKey]);
    } else {
      tableNames = ['movies', 'theaters', 'screens', 'seats', 'showtimes', 'concessions', 'bookings', 'booking_seats'];
    }

    let sqlDump = `-- ===================================================================\n`;
    sqlDump += `-- CinePass Movie Ticket Booking Platform - Live SQL Database Export\n`;
    sqlDump += `-- Generated Date: ${new Date().toISOString()}\n`;
    sqlDump += `-- Host: ${dbConfig.host}:${dbConfig.port} | Database: ${dbConfig.database}\n`;
    sqlDump += `-- Engine: ${dbConfig.engine || 'MySQL 8.0'}\n`;
    sqlDump += `-- ===================================================================\n\n`;
    sqlDump += `SET FOREIGN_KEY_CHECKS = 0;\n\n`;

    for (const table of tableNames) {
      sqlDump += `-- -------------------------------------------------------------\n`;
      sqlDump += `-- Table structure and live data for \`${table}\`\n`;
      sqlDump += `-- -------------------------------------------------------------\n`;
      sqlDump += `DROP TABLE IF EXISTS \`${table}\`;\n`;

      try {
        const [createRows] = await pool.query(`SHOW CREATE TABLE \`${table}\``);
        if (createRows && createRows[0]) {
          const createStmt = createRows[0]['Create Table'] || Object.values(createRows[0])[1];
          sqlDump += `${createStmt};\n\n`;
        }
      } catch (e) {
        // Fallback create comment if show create fails
        sqlDump += `-- [Note: Schema created dynamically]\n\n`;
      }

      // Fetch all live records
      try {
        const [rows] = await pool.query(`SELECT * FROM \`${table}\``);
        if (rows && rows.length > 0) {
          const columns = Object.keys(rows[0]);
          const colList = columns.map(c => `\`${c}\``).join(', ');

          sqlDump += `INSERT INTO \`${table}\` (${colList}) VALUES\n`;
          const valStrings = rows.map(row => {
            const vals = columns.map(col => {
              const val = row[col];
              if (val === null || val === undefined) return 'NULL';
              if (typeof val === 'number') return val;
              if (val instanceof Date) return `'${val.toISOString().slice(0, 19).replace('T', ' ')}'`;
              return `'${String(val).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
            });
            return `  (${vals.join(', ')})`;
          });

          sqlDump += valStrings.join(',\n') + ';\n\n';
        }
      } catch (rowErr) {
        sqlDump += `-- Error reading data for ${table}: ${rowErr.message}\n\n`;
      }
    }

    sqlDump += `SET FOREIGN_KEY_CHECKS = 1;\n`;
    sqlDump += `-- Export completed successfully.\n`;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `cinepass_db_export_${timestamp}.sql`;

    res.setHeader('Content-Type', 'application/sql; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(sqlDump);
  } catch (error) {
    console.error('Error generating SQL export:', error);
    res.status(500).json({ success: false, message: 'Failed to generate SQL export: ' + error.message });
  }
});

// Fallback route for static navigation
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: 'API endpoint not found.' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// -------------------------------------------------------------
// Start Server
// -------------------------------------------------------------
async function startServer() {
  try {
    await initializeDatabase();
      const server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`====================================================`);
        console.log(`🎬 CinePass Movie Booking System is LIVE!`);
        console.log(`🌐 Server running at: http://localhost:${PORT}`);
        console.log(`🗄️  Connected to MySQL Database: ${dbConfig.database}`);
        console.log(`====================================================`);
      });

      // Graceful shutdown
      process.on('SIGTERM', () => {
        console.log('SIGTERM received. Shutting down gracefully...');
        server.close(() => process.exit(0));
      });
      process.on('SIGINT', () => {
        console.log('SIGINT received. Shutting down gracefully...');
        server.close(() => process.exit(0));
      });
    } catch (error) {
      console.error('Fatal: Failed to start application:', error.message);
      process.exit(1);
    }
  }

startServer();
