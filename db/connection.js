const mysql = require('mysql2/promise');
require('dotenv').config();

function getDbConfig() {
  const dbUrl = process.env.DATABASE_URL || process.env.MYSQL_URL || process.env.JAWSDB_URL || process.env.CLEARDB_DATABASE_URL;
  if (dbUrl) {
    try {
      const parsed = new URL(dbUrl);
      const isSsl = process.env.DB_SSL === 'true' || parsed.searchParams.get('ssl') === 'true' || process.env.NODE_ENV === 'production';
      return {
        host: parsed.hostname,
        port: parseInt(parsed.port || '3306', 10),
        user: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password),
        database: parsed.pathname.replace(/^\//, '') || 'movie_booking_db',
        waitForConnections: true,
        connectionLimit: 15,
        queueLimit: 0,
        decimalNumbers: true,
        ssl: isSsl ? { rejectUnauthorized: false } : undefined
      };
    } catch (e) {
      console.warn('[SQL DB] Could not parse DATABASE_URL as URL, falling back to individual env variables.');
    }
  }

  const isSsl = process.env.DB_SSL === 'true';
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'movie_booking_db',
    waitForConnections: true,
    connectionLimit: 15,
    queueLimit: 0,
    decimalNumbers: true,
    ssl: isSsl ? { rejectUnauthorized: false } : undefined
  };
}

const dbConfig = getDbConfig();
let pool = null;
let isUsingSqlite = false;

async function initializeDatabase() {
  try {
    // 1. Try to ensure database exists if permissions allow
    try {
      const rootConn = await mysql.createConnection({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password,
        ssl: dbConfig.ssl,
        connectTimeout: 4000
      });
      await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      await rootConn.end();
    } catch (permErr) {
      if (permErr.code === 'ECONNREFUSED' || permErr.code === 'ETIMEDOUT' || permErr.code === 'ENOTFOUND') {
        throw permErr;
      }
      // On some cloud providers (Aiven, PlanetScale, AWS RDS with restricted users), CREATE DATABASE is restricted.
      console.log(`[SQL DB] Root DB creation skipped (${permErr.message}). Connecting directly to target database.`);
    }

    // 2. Create the connection pool with the database selected
    pool = mysql.createPool(dbConfig);
    const testConn = await pool.getConnection();
    testConn.release();

    console.log(`[SQL DB] Connected to MySQL server at ${dbConfig.host}:${dbConfig.port} (DB: ${dbConfig.database})`);
    dbConfig.engine = 'MySQL 8.0';
    isUsingSqlite = false;

    // 3. Create tables
    await createTables();

    // 4. Seed initial catalog (movies, theaters, screens, physical seats, concessions) if empty
    await seedInitialData();

    // 5. Ensure rolling showtimes are always present for today + 4 days (WITHOUT fake bookings)
    await ensureFreshShowtimes();

    console.log('[SQL DB] Database initialization completed successfully.');
    return pool;
  } catch (error) {
    console.warn(`[SQL DB] MySQL connection not reachable (${error.message}).`);
    console.log('[SQL DB] Activating zero-config integrated SQLite live engine fallback so the website runs with 100% availability...');
    const { initializeSqlite, sqlitePool } = require('./sqlite-fallback');
    pool = await initializeSqlite();
    dbConfig.engine = 'SQLite 3.50 (Self-Contained)';
    isUsingSqlite = true;
    return pool;
  }
}

async function createTables() {
  const conn = await pool.getConnection();
  try {
    // Movies
    await conn.query(`
      CREATE TABLE IF NOT EXISTS movies (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL,
        tagline VARCHAR(255),
        description TEXT NOT NULL,
        genre VARCHAR(100) NOT NULL,
        duration_mins INT NOT NULL,
        rating DECIMAL(3,1) DEFAULT 8.0,
        certificate VARCHAR(10) DEFAULT 'UA',
        language VARCHAR(50) DEFAULT 'English',
        formats VARCHAR(100) DEFAULT '2D, 3D, IMAX',
        release_date DATE,
        director VARCHAR(150),
        cast VARCHAR(255),
        poster_url TEXT NOT NULL,
        banner_url TEXT NOT NULL,
        trailer_url TEXT,
        is_featured BOOLEAN DEFAULT FALSE,
        is_now_showing BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    // Theaters
    await conn.query(`
      CREATE TABLE IF NOT EXISTS theaters (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        chain VARCHAR(50) DEFAULT 'PVR',
        city VARCHAR(100) DEFAULT 'Mumbai',
        address VARCHAR(255) NOT NULL,
        amenities VARCHAR(255) DEFAULT 'Dolby Atmos, 4K Laser, Recliners, Gourmet Food',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    // Screens
    await conn.query(`
      CREATE TABLE IF NOT EXISTS screens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        theater_id INT NOT NULL,
        screen_name VARCHAR(100) NOT NULL,
        screen_type VARCHAR(50) DEFAULT 'IMAX with Laser',
        rows_count INT DEFAULT 7,
        cols_count INT DEFAULT 10,
        total_seats INT DEFAULT 70,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (theater_id) REFERENCES theaters(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    // Seats
    await conn.query(`
      CREATE TABLE IF NOT EXISTS seats (
        id INT AUTO_INCREMENT PRIMARY KEY,
        screen_id INT NOT NULL,
        row_label VARCHAR(5) NOT NULL,
        seat_number INT NOT NULL,
        seat_code VARCHAR(10) NOT NULL,
        tier ENUM('VIP', 'PREMIUM', 'STANDARD') DEFAULT 'STANDARD',
        base_price_factor DECIMAL(3,2) DEFAULT 1.00,
        UNIQUE KEY unique_screen_seat (screen_id, seat_code),
        FOREIGN KEY (screen_id) REFERENCES screens(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    // Showtimes
    await conn.query(`
      CREATE TABLE IF NOT EXISTS showtimes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        movie_id INT NOT NULL,
        theater_id INT NOT NULL,
        screen_id INT NOT NULL,
        show_date DATE NOT NULL,
        show_time TIME NOT NULL,
        price_standard DECIMAL(8,2) DEFAULT 220.00,
        price_premium DECIMAL(8,2) DEFAULT 350.00,
        price_vip DECIMAL(8,2) DEFAULT 550.00,
        status ENUM('ACTIVE', 'SOLD_OUT', 'CANCELLED') DEFAULT 'ACTIVE',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
        FOREIGN KEY (theater_id) REFERENCES theaters(id) ON DELETE CASCADE,
        FOREIGN KEY (screen_id) REFERENCES screens(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    // Concessions
    await conn.query(`
      CREATE TABLE IF NOT EXISTS concessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        category ENUM('Popcorn', 'Beverages', 'Snacks', 'Combos') NOT NULL,
        description VARCHAR(255),
        price DECIMAL(8,2) NOT NULL,
        image_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    // Bookings
    await conn.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        booking_reference VARCHAR(30) UNIQUE NOT NULL,
        showtime_id INT NOT NULL,
        customer_name VARCHAR(120) NOT NULL,
        customer_email VARCHAR(150) NOT NULL,
        customer_phone VARCHAR(30) NOT NULL,
        seat_count INT NOT NULL,
        seats_list VARCHAR(255) NOT NULL,
        subtotal_amount DECIMAL(10,2) NOT NULL,
        convenience_fee DECIMAL(10,2) DEFAULT 35.00,
        discount_amount DECIMAL(10,2) DEFAULT 0.00,
        promo_code VARCHAR(50) NULL,
        concessions_amount DECIMAL(10,2) DEFAULT 0.00,
        concessions_details TEXT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        payment_method VARCHAR(50) DEFAULT 'Card',
        payment_status ENUM('PAID', 'PENDING', 'REFUNDED') DEFAULT 'PAID',
        booking_status ENUM('CONFIRMED', 'CANCELLED') DEFAULT 'CONFIRMED',
        booking_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (showtime_id) REFERENCES showtimes(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB;
    `);

    // Booking Seats
    await conn.query(`
      CREATE TABLE IF NOT EXISTS booking_seats (
        id INT AUTO_INCREMENT PRIMARY KEY,
        booking_id INT NOT NULL,
        showtime_id INT NOT NULL,
        seat_code VARCHAR(10) NOT NULL,
        tier VARCHAR(20) NOT NULL,
        price DECIMAL(8,2) NOT NULL,
        UNIQUE KEY unique_showtime_seat (showtime_id, seat_code),
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
        FOREIGN KEY (showtime_id) REFERENCES showtimes(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    console.log('[SQL DB] All 8 relational tables verified/created successfully.');
  } finally {
    conn.release();
  }
}

async function seedInitialData() {
  const conn = await pool.getConnection();
  try {
    const [movieRows] = await conn.query('SELECT COUNT(*) as count FROM movies');
    if (movieRows[0].count > 0) {
      return;
    }

    console.log('[SQL DB] Populating base cinema catalog...');

    // 1. Insert Movies
    const movies = [
      {
        title: 'Dune: Part Two',
        slug: 'dune-part-two',
        tagline: 'Long live the fighters.',
        description: 'Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family. Facing a choice between the love of his life and the fate of the known universe, he endeavors to prevent a terrible future only he can foresee.',
        genre: 'Sci-Fi / Adventure',
        duration_mins: 166,
        rating: 8.8,
        certificate: 'UA 16+',
        language: 'English',
        formats: 'IMAX with Laser, 4DX, 2D',
        release_date: '2024-03-01',
        director: 'Denis Villeneuve',
        cast: 'Timothée Chalamet, Zendaya, Rebecca Ferguson, Javier Bardem',
        poster_url: 'https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg',
        banner_url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1600&q=80',
        trailer_url: 'https://www.youtube.com/embed/Way9Dexny3w',
        is_featured: true,
        is_now_showing: true
      },
      {
        title: 'Oppenheimer',
        slug: 'oppenheimer',
        tagline: 'The world forever changes.',
        description: 'The story of American scientist J. Robert Oppenheimer and his role in the development of the atomic bomb during World War II, exploring moral dilemmas, national security, and history-defining science.',
        genre: 'Biography / Drama / History',
        duration_mins: 180,
        rating: 8.9,
        certificate: 'A',
        language: 'English',
        formats: 'IMAX 70mm, Dolby Atmos, 2D',
        release_date: '2023-07-21',
        director: 'Christopher Nolan',
        cast: 'Cillian Murphy, Emily Blunt, Matt Damon, Robert Downey Jr.',
        poster_url: 'https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
        banner_url: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?auto=format&fit=crop&w=1600&q=80',
        trailer_url: 'https://www.youtube.com/embed/uYPbbksJxIg',
        is_featured: true,
        is_now_showing: true
      },
      {
        title: 'Interstellar (10th Anniversary IMAX Re-Release)',
        slug: 'interstellar',
        tagline: 'Mankind was born on Earth. It was never meant to die here.',
        description: 'When Earth becomes uninhabitable in the future, a farmer and ex-NASA pilot, Joseph Cooper, is tasked to pilot a spacecraft, along with a team of researchers, to find a new planet for humans.',
        genre: 'Sci-Fi / Adventure / Drama',
        duration_mins: 169,
        rating: 8.7,
        certificate: 'UA',
        language: 'English',
        formats: 'IMAX with Laser, 4DX',
        release_date: '2014-11-07',
        director: 'Christopher Nolan',
        cast: 'Matthew McConaughey, Anne Hathaway, Jessica Chastain, Michael Caine',
        poster_url: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
        banner_url: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=1600&q=80',
        trailer_url: 'https://www.youtube.com/embed/zSWdZVtXT7E',
        is_featured: true,
        is_now_showing: true
      },
      {
        title: 'Spider-Man: Beyond the Spider-Verse',
        slug: 'spider-man-beyond-the-spider-verse',
        tagline: 'Across every dimension, destiny will be rewritten.',
        description: 'Miles Morales catapults across the Multiverse, where he encounters a team of Spider-People charged with protecting its very existence. When the heroes clash on how to handle a new threat, Miles must redefine what it means to be a hero.',
        genre: 'Animation / Action / Sci-Fi',
        duration_mins: 140,
        rating: 9.0,
        certificate: 'U',
        language: 'English',
        formats: '3D, 2D, 4DX',
        release_date: '2025-06-20',
        director: 'Joaquim Dos Santos, Kemp Powers',
        cast: 'Shameik Moore, Hailee Steinfeld, Oscar Isaac, Daniel Kaluuya',
        poster_url: 'https://image.tmdb.org/t/p/w500/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg',
        banner_url: 'https://images.unsplash.com/photo-1635805737707-575885ab0820?auto=format&fit=crop&w=1600&q=80',
        trailer_url: 'https://www.youtube.com/embed/cqGjhVJWtEg',
        is_featured: false,
        is_now_showing: true
      },
      {
        title: 'Deadpool & Wolverine',
        slug: 'deadpool-and-wolverine',
        tagline: 'Everyone deserves a happy ending.',
        description: 'A listless Wade Wilson toils away in civilian life with his days as the morally flexible mercenary Deadpool behind him. But when his homeworld faces an existential threat, Wade must reluctantly suit-up again with an even more reluctant Wolverine.',
        genre: 'Action / Comedy / Sci-Fi',
        duration_mins: 128,
        rating: 8.2,
        certificate: 'A',
        language: 'English',
        formats: '3D, 4DX, IMAX, 2D',
        release_date: '2024-07-26',
        director: 'Shawn Levy',
        cast: 'Ryan Reynolds, Hugh Jackman, Emma Corrin, Matthew Macfadyen',
        poster_url: 'https://image.tmdb.org/t/p/w500/8cdWjvZQUExUUTzyp4t6EDMubfO.jpg',
        banner_url: 'https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=1600&q=80',
        trailer_url: 'https://www.youtube.com/embed/73_1biulkYk',
        is_featured: false,
        is_now_showing: true
      },
      {
        title: 'Avatar: Fire and Ash',
        slug: 'avatar-fire-and-ash',
        tagline: 'Discover the volcanic clans of Pandora.',
        description: 'Jake Sully and Neytiri travel to uncharted regions of Pandora, meeting the nomadic Ash People who worship fire. As resources dwindle and ancient secrets emerge, the Sully family must fight for the preservation of Pandora.',
        genre: 'Sci-Fi / Action / Fantasy',
        duration_mins: 185,
        rating: 8.6,
        certificate: 'UA 13+',
        language: 'English',
        formats: 'IMAX 3D, RealD 3D, 4DX',
        release_date: '2025-12-19',
        director: 'James Cameron',
        cast: 'Sam Worthington, Zoe Saldana, Sigourney Weaver, Oona Chaplin',
        poster_url: 'https://image.tmdb.org/t/p/w500/t6HIqrRAclMCA60NsSmeqe9RmNV.jpg',
        banner_url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1600&q=80',
        trailer_url: 'https://www.youtube.com/embed/d9MyW72ELq0',
        is_featured: false,
        is_now_showing: true
      }
    ];

    for (const m of movies) {
      await conn.query(
        `INSERT INTO movies (title, slug, tagline, description, genre, duration_mins, rating, certificate, language, formats, release_date, director, cast, poster_url, banner_url, trailer_url, is_featured, is_now_showing)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [m.title, m.slug, m.tagline, m.description, m.genre, m.duration_mins, m.rating, m.certificate, m.language, m.formats, m.release_date, m.director, m.cast, m.poster_url, m.banner_url, m.trailer_url, m.is_featured, m.is_now_showing]
      );
    }

    // 2. Insert Theaters
    const theaters = [
      {
        name: 'PVR INOX Gold Class & IMAX',
        chain: 'PVR INOX',
        city: 'Mumbai',
        address: 'Palladium Mall, Senapati Bapat Marg, Lower Parel',
        amenities: 'IMAX Laser, Dolby Atmos 7.1, Recliner Lounges, Fine Dining'
      },
      {
        name: 'Cinépolis VIP Megaplex',
        chain: 'Cinépolis',
        city: 'Mumbai',
        address: 'Viviana Mall, Eastern Express Hwy, Thane West',
        amenities: '4DX Motion, RealD 3D, Gourmet Concessions, In-Seat Service'
      },
      {
        name: 'Carnival IMAX Cinema Dome',
        chain: 'Carnival',
        city: 'Mumbai',
        address: 'Bhakti Park, Anik Wadala Link Rd, Wadala East',
        amenities: 'Giant Dome Screen, Laser 4K, Dolby Atmos, VIP Club'
      }
    ];

    for (const t of theaters) {
      await conn.query(
        `INSERT INTO theaters (name, chain, city, address, amenities) VALUES (?, ?, ?, ?, ?)`,
        [t.name, t.chain, t.city, t.address, t.amenities]
      );
    }

    // 3. Insert Screens (2 screens per theater = 6 screens)
    const screensData = [
      { theater_id: 1, screen_name: 'Audi 1 - IMAX with Laser', screen_type: 'IMAX Laser' },
      { theater_id: 1, screen_name: 'Audi 2 - Dolby Atmos Gold', screen_type: 'Dolby Cinema' },
      { theater_id: 2, screen_name: 'Audi 1 - 4DX Sensory', screen_type: '4DX' },
      { theater_id: 2, screen_name: 'Audi 2 - VIP Recliner Suite', screen_type: 'VIP Recliner' },
      { theater_id: 3, screen_name: 'Audi 1 - Laser 4K Cinema', screen_type: 'Dolby Cinema' },
      { theater_id: 3, screen_name: 'Audi 2 - BigPix Ultra 3D', screen_type: 'RealD 3D' }
    ];

    for (const s of screensData) {
      const [res] = await conn.query(
        `INSERT INTO screens (theater_id, screen_name, screen_type, rows_count, cols_count, total_seats)
         VALUES (?, ?, ?, 7, 10, 70)`,
        [s.theater_id, s.screen_name, s.screen_type]
      );
      const screenId = res.insertId;

      // 4. Generate 70 seats for each screen
      // Rows: A, B (Standard, ₹220)
      // Rows: C, D, E (Premium, ₹350)
      // Rows: F, G (VIP Recliner, ₹550)
      const seatRows = [
        { label: 'A', tier: 'STANDARD', factor: 1.0 },
        { label: 'B', tier: 'STANDARD', factor: 1.0 },
        { label: 'C', tier: 'PREMIUM', factor: 1.5 },
        { label: 'D', tier: 'PREMIUM', factor: 1.5 },
        { label: 'E', tier: 'PREMIUM', factor: 1.5 },
        { label: 'F', tier: 'VIP', factor: 2.2 },
        { label: 'G', tier: 'VIP', factor: 2.2 }
      ];

      for (const row of seatRows) {
        for (let num = 1; num <= 10; num++) {
          const seatCode = `${row.label}${num}`;
          await conn.query(
            `INSERT INTO seats (screen_id, row_label, seat_number, seat_code, tier, base_price_factor)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [screenId, row.label, num, seatCode, row.tier, row.factor]
          );
        }
      }
    }

    // 5. Insert Concessions / Food & Beverages
    const concessions = [
      {
        name: 'Golden Butter Popcorn (Large)',
        category: 'Popcorn',
        description: 'Freshly popped warm golden corn tossed in imported rich creamery butter.',
        price: 240.00,
        image_url: 'https://images.unsplash.com/photo-1585647347483-22b66260dfff?auto=format&fit=crop&w=400&q=80'
      },
      {
        name: 'Gourmet Caramel Crunch Popcorn',
        category: 'Popcorn',
        description: 'Crispy artisanal mushroom corn glazed with caramelized brown sugar & sea salt.',
        price: 290.00,
        image_url: 'https://images.unsplash.com/photo-1578849278619-e73505e9610f?auto=format&fit=crop&w=400&q=80'
      },
      {
        name: 'Loaded Nachos with Warm Jalapeño Cheese',
        category: 'Snacks',
        description: 'Crispy tortilla chips served with spicy melted cheese sauce and salsa mexicana.',
        price: 260.00,
        image_url: 'https://images.unsplash.com/photo-1513456852971-30c0b8199d4d?auto=format&fit=crop&w=400&q=80'
      },
      {
        name: 'Crispy French Fries with Peri-Peri Dip',
        category: 'Snacks',
        description: 'Golden potato fries seasoned with smoked paprika and roasted herbs.',
        price: 210.00,
        image_url: 'https://images.unsplash.com/photo-1576107232684-1279f3908594?auto=format&fit=crop&w=400&q=80'
      },
      {
        name: 'Chilled Fountain Pepsi (650ml)',
        category: 'Beverages',
        description: 'Ice-cold refreshing fountain cola with lemon wedge.',
        price: 160.00,
        image_url: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=400&q=80'
      },
      {
        name: 'Fresh Iced Peach Tea',
        category: 'Beverages',
        description: 'Brewed black tea infused with succulent natural peach essence & mint.',
        price: 190.00,
        image_url: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=400&q=80'
      },
      {
        name: 'Blockbuster Combo for Two',
        category: 'Combos',
        description: '1 Jumbo Butter Popcorn + 2 Chilled Fountain Drinks (500ml) + 1 Nachos.',
        price: 580.00,
        image_url: 'https://images.unsplash.com/photo-1505686994434-e3cc5abf1330?auto=format&fit=crop&w=400&q=80'
      },
      {
        name: 'Solo Movie Lover Combo',
        category: 'Combos',
        description: '1 Medium Caramel Popcorn + 1 Chilled Beverage (500ml).',
        price: 360.00,
        image_url: 'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=400&q=80'
      }
    ];

    for (const c of concessions) {
      await conn.query(
        `INSERT INTO concessions (name, category, description, price, image_url) VALUES (?, ?, ?, ?, ?)`,
        [c.name, c.category, c.description, c.price, c.image_url]
      );
    }

    console.log('[SQL DB] Base cinema catalog successfully populated.');
  } finally {
    conn.release();
  }
}

async function ensureFreshShowtimes() {
  const conn = await pool.getConnection();
  try {
    const [existingCount] = await conn.query(`
      SELECT COUNT(*) as count FROM showtimes WHERE show_date >= CURDATE()
    `);

    if (existingCount[0].count >= 15) {
      return;
    }

    console.log('[SQL DB] Generating fresh rolling showtimes for today and upcoming dates...');

    const [movies] = await conn.query('SELECT id FROM movies LIMIT 6');
    const [theaters] = await conn.query('SELECT id FROM theaters LIMIT 3');
    const [screens] = await conn.query('SELECT id, theater_id FROM screens');

    const showHours = ['10:30:00', '14:15:00', '18:00:00', '21:45:00'];

    for (let dayOffset = 0; dayOffset <= 4; dayOffset++) {
      for (const movie of movies) {
        for (const screen of screens) {
          const timeSlot = showHours[(movie.id + screen.id + dayOffset) % showHours.length];
          const secondSlot = showHours[(movie.id + screen.id + dayOffset + 2) % showHours.length];

          const slots = [timeSlot, secondSlot];

          for (const time of slots) {
            const [exists] = await conn.query(
              `SELECT id FROM showtimes
               WHERE movie_id = ? AND screen_id = ? AND show_date = DATE_ADD(CURDATE(), INTERVAL ? DAY) AND show_time = ?`,
              [movie.id, screen.id, dayOffset, time]
            );

            if (exists.length === 0) {
              await conn.query(
                `INSERT INTO showtimes (movie_id, theater_id, screen_id, show_date, show_time, price_standard, price_premium, price_vip, status)
                 VALUES (?, ?, ?, DATE_ADD(CURDATE(), INTERVAL ? DAY), ?, 240.00, 360.00, 550.00, 'ACTIVE')`,
                [movie.id, screen.theater_id, screen.id, dayOffset, time]
              );
              // Clean production mode: NO dummy bookings are pre-created!
            }
          }
        }
      }
    }

    console.log('[SQL DB] Fresh rolling showtimes ready for live bookings.');
  } finally {
    conn.release();
  }
}

/**
 * Completely clean all demo/test bookings & release all seats
 */
async function cleanDemoData() {
  if (isUsingSqlite) {
    const { sqlitePool } = require('./sqlite-fallback');
    const conn = await sqlitePool.getConnection();
    await conn.query('DELETE FROM booking_seats');
    await conn.query('DELETE FROM bookings');
    return { success: true, message: 'All demo bookings and occupied seats have been cleared.' };
  }

  if (!pool) {
    pool = mysql.createPool(dbConfig);
  }
  const conn = await pool.getConnection();
  try {
    console.log('[SQL DB] Cleaning all demo bookings and releasing all seats...');
    await conn.query('DELETE FROM booking_seats');
    await conn.query('DELETE FROM bookings');
    await conn.query('ALTER TABLE bookings AUTO_INCREMENT = 1');
    await conn.query('ALTER TABLE booking_seats AUTO_INCREMENT = 1');
    console.log('[SQL DB] All demo bookings removed. Total bookings = 0, all seats 100% available.');
    return { success: true, message: 'All demo bookings and occupied seats have been cleared.' };
  } finally {
    conn.release();
  }
}

function getPool() {
  if (!pool) {
    throw new Error('Database pool has not been initialized. Call initializeDatabase() first.');
  }
  return pool;
}

module.exports = {
  initializeDatabase,
  getPool,
  dbConfig,
  cleanDemoData
};
