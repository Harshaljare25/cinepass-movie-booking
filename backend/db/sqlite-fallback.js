const sqlite3 = require('sqlite3').verbose();
const path = require('path');

let sqliteDb = null;
const dbFilePath = path.join(__dirname, '..', 'movie_booking.sqlite');

function getSqliteDb() {
  if (!sqliteDb) {
    sqliteDb = new sqlite3.Database(dbFilePath);
  }
  return sqliteDb;
}

function normalizeQuery(sql) {
  return sql
    .replace(/\bNOW\(\)/gi, "DATETIME('now', 'localtime')")
    .replace(/\bVERSION\(\)/gi, "'SQLite 3.50 (Self-Contained Live Engine)'")
    .replace(/\bCURDATE\(\)/gi, "DATE('now', 'localtime')")
    .replace(/DATE_ADD\(CURDATE\(\),\s*INTERVAL\s*(\?|\d+)\s*DAY\)/gi, "DATE('now', 'localtime', '+' || ? || ' days')")
    .replace(/\bENGINE=InnoDB\b/gi, "")
    .replace(/\bAUTO_INCREMENT\b/gi, "AUTOINCREMENT")
    .replace(/\bBOOLEAN\b/gi, "INTEGER")
    .replace(/ENUM\([^)]+\)/gi, "TEXT");
}

function run(sql, params = []) {
  const db = getSqliteDb();
  return new Promise((resolve, reject) => {
    db.run(normalizeQuery(sql), params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function all(sql, params = []) {
  const db = getSqliteDb();
  return new Promise((resolve, reject) => {
    db.all(normalizeQuery(sql), params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

async function query(sql, params = []) {
  const norm = normalizeQuery(sql).trim();
  const upper = norm.toUpperCase();
  if (
    upper.startsWith('SELECT') ||
    upper.startsWith('SHOW') ||
    upper.startsWith('PRAGMA') ||
    upper.startsWith('EXPLAIN')
  ) {
    const rows = await all(sql, params);
    const fields = rows.length > 0 ? Object.keys(rows[0]).map(name => ({ name })) : [];
    return [rows, fields];
  } else {
    const result = await run(sql, params);
    return [{ insertId: result.lastID, affectedRows: result.changes }, []];
  }
}

const sqlitePool = {
  query,
  getConnection: async () => ({
    query,
    beginTransaction: async () => run('BEGIN TRANSACTION'),
    commit: async () => run('COMMIT'),
    rollback: async () => run('ROLLBACK'),
    release: () => { }
  })
};

async function initializeSqlite() {
  console.log(`[SQL DB] Initializing self-contained SQLite live engine at ${dbFilePath}...`);

  await run(`
    CREATE TABLE IF NOT EXISTS movies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL,
      tagline TEXT,
      description TEXT NOT NULL,
      genre TEXT NOT NULL,
      duration_mins INTEGER NOT NULL,
      rating REAL DEFAULT 8.0,
      certificate TEXT DEFAULT 'UA',
      language TEXT DEFAULT 'English',
      formats TEXT DEFAULT '2D, 3D, IMAX',
      release_date TEXT,
      director TEXT,
      cast TEXT,
      poster_url TEXT NOT NULL,
      banner_url TEXT NOT NULL,
      trailer_url TEXT,
      is_featured INTEGER DEFAULT 0,
      is_now_showing INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS theaters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      chain TEXT DEFAULT 'PVR',
      city TEXT DEFAULT 'Mumbai',
      address TEXT NOT NULL,
      amenities TEXT DEFAULT 'Dolby Atmos, 4K Laser, Recliners, Gourmet Food',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS screens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      theater_id INTEGER NOT NULL,
      screen_name TEXT NOT NULL,
      screen_type TEXT DEFAULT 'IMAX with Laser',
      rows_count INTEGER DEFAULT 7,
      cols_count INTEGER DEFAULT 10,
      total_seats INTEGER DEFAULT 70,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS seats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      screen_id INTEGER NOT NULL,
      row_label TEXT NOT NULL,
      seat_number INTEGER NOT NULL,
      seat_code TEXT NOT NULL,
      tier TEXT DEFAULT 'STANDARD',
      base_price_factor REAL DEFAULT 1.00,
      UNIQUE(screen_id, seat_code)
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS showtimes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      movie_id INTEGER NOT NULL,
      theater_id INTEGER NOT NULL,
      screen_id INTEGER NOT NULL,
      show_date TEXT NOT NULL,
      show_time TEXT NOT NULL,
      price_standard REAL DEFAULT 220.00,
      price_premium REAL DEFAULT 350.00,
      price_vip REAL DEFAULT 550.00,
      status TEXT DEFAULT 'ACTIVE',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS concessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      image_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_reference TEXT UNIQUE NOT NULL,
      showtime_id INTEGER NOT NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      seat_count INTEGER NOT NULL,
      seats_list TEXT NOT NULL,
      subtotal_amount REAL NOT NULL,
      convenience_fee REAL DEFAULT 35.00,
      discount_amount REAL DEFAULT 0.00,
      promo_code TEXT,
      concessions_amount REAL DEFAULT 0.00,
      concessions_details TEXT,
      total_amount REAL NOT NULL,
      payment_method TEXT DEFAULT 'Card',
      payment_status TEXT DEFAULT 'PAID',
      booking_status TEXT DEFAULT 'CONFIRMED',
      booking_date DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS booking_seats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL,
      showtime_id INTEGER NOT NULL,
      seat_code TEXT NOT NULL,
      tier TEXT NOT NULL,
      price REAL NOT NULL,
      UNIQUE(showtime_id, seat_code)
    );
  `);

  // Check if movies seeded
  const movies = await all('SELECT COUNT(*) as count FROM movies');
  if (movies[0].count === 0) {
    console.log('[SQL DB: SQLite] Seeding base cinema catalog...');
    const baseMovies = [
      ['Dune: Part Two', 'dune-part-two', 'Long live the fighters.', 'Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family.', 'Sci-Fi / Adventure', 166, 8.8, 'UA 16+', 'English', 'IMAX with Laser, 4DX, 2D', '2024-03-01', 'Denis Villeneuve', 'Timothée Chalamet, Zendaya', 'https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg', 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1600&q=80', 'https://www.youtube.com/embed/Way9Dexny3w', 1, 1],
      ['Oppenheimer', 'oppenheimer', 'The world forever changes.', 'The story of American scientist J. Robert Oppenheimer and his role in the development of the atomic bomb.', 'Biography / Drama / History', 180, 8.9, 'A', 'English', 'IMAX 70mm, Dolby Atmos, 2D', '2023-07-21', 'Christopher Nolan', 'Cillian Murphy, Emily Blunt', 'https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg', 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?auto=format&fit=crop&w=1600&q=80', 'https://www.youtube.com/embed/uYPbbksJxIg', 1, 1],
      ['Interstellar (10th Anniversary IMAX Re-Release)', 'interstellar', 'Mankind was born on Earth. It was never meant to die here.', 'A team of explorers travel through a wormhole in space in an attempt to ensure humanity\'s survival.', 'Sci-Fi / Adventure / Drama', 169, 8.7, 'UA', 'English', 'IMAX with Laser, 4DX', '2014-11-07', 'Christopher Nolan', 'Matthew McConaughey, Anne Hathaway', 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg', 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=1600&q=80', 'https://www.youtube.com/embed/zSWdZVtXT7E', 1, 1],
      ['Spider-Man: Beyond the Spider-Verse', 'spider-man-beyond-the-spider-verse', 'Across every dimension, destiny will be rewritten.', 'Miles Morales catapults across the Multiverse to protect its existence.', 'Animation / Action / Sci-Fi', 140, 9.0, 'U', 'English', '3D, 2D, 4DX', '2025-06-20', 'Joaquim Dos Santos', 'Shameik Moore, Hailee Steinfeld', 'https://image.tmdb.org/t/p/w500/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg', 'https://images.unsplash.com/photo-1635805737707-575885ab0820?auto=format&fit=crop&w=1600&q=80', 'https://www.youtube.com/embed/cqGjhVJWtEg', 0, 1],
      ['Deadpool & Wolverine', 'deadpool-and-wolverine', 'Everyone deserves a happy ending.', 'Wade Wilson teams up with Wolverine to protect their universe from extinction.', 'Action / Comedy / Sci-Fi', 128, 8.2, 'A', 'English', '3D, 4DX, IMAX, 2D', '2024-07-26', 'Shawn Levy', 'Ryan Reynolds, Hugh Jackman', 'https://image.tmdb.org/t/p/w500/8cdWjvZQUExUUTzyp4t6EDMubfO.jpg', 'https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=1600&q=80', 'https://www.youtube.com/embed/73_1biulkYk', 0, 1],
      ['Avatar: Fire and Ash', 'avatar-fire-and-ash', 'Discover the volcanic clans of Pandora.', 'Jake Sully and Neytiri travel to uncharted regions of Pandora, meeting the Ash People.', 'Sci-Fi / Action / Fantasy', 185, 8.6, 'UA 13+', 'English', 'IMAX 3D, RealD 3D, 4DX', '2025-12-19', 'James Cameron', 'Sam Worthington, Zoe Saldana', 'https://image.tmdb.org/t/p/w500/t6HIqrRAclMCA60NsSmeqe9RmNV.jpg', 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1600&q=80', 'https://www.youtube.com/embed/d9MyW72ELq0', 0, 1]
    ];

    for (const m of baseMovies) {
      await run(`
        INSERT INTO movies (title, slug, tagline, description, genre, duration_mins, rating, certificate, language, formats, release_date, director, cast, poster_url, banner_url, trailer_url, is_featured, is_now_showing)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, m);
    }

    // Theaters
    const theaters = [
      ['PVR INOX Gold Class & IMAX', 'PVR INOX', 'Mumbai', 'Palladium Mall, Senapati Bapat Marg, Lower Parel', 'IMAX Laser, Dolby Atmos 7.1, Recliner Lounges, Fine Dining'],
      ['Cinépolis VIP Megaplex', 'Cinépolis', 'Mumbai', 'Viviana Mall, Eastern Express Hwy, Thane West', '4DX Motion, RealD 3D, Gourmet Concessions, In-Seat Service'],
      ['Carnival IMAX Cinema Dome', 'Carnival', 'Mumbai', 'Bhakti Park, Anik Wadala Link Rd, Wadala East', 'Giant Dome Screen, Laser 4K, Dolby Atmos, VIP Club']
    ];
    for (const t of theaters) {
      await run('INSERT INTO theaters (name, chain, city, address, amenities) VALUES (?, ?, ?, ?, ?)', t);
    }

    // Screens
    const screens = [
      [1, 'Audi 1 - IMAX with Laser', 'IMAX Laser'],
      [1, 'Audi 2 - Dolby Atmos Gold', 'Dolby Cinema'],
      [2, 'Audi 1 - 4DX Sensory', '4DX'],
      [2, 'Audi 2 - VIP Recliner Suite', 'VIP Recliner'],
      [3, 'Audi 1 - Laser 4K Cinema', 'Dolby Cinema'],
      [3, 'Audi 2 - BigPix Ultra 3D', 'RealD 3D']
    ];
    for (const s of screens) {
      const res = await run('INSERT INTO screens (theater_id, screen_name, screen_type, rows_count, cols_count, total_seats) VALUES (?, ?, ?, 7, 10, 70)', s);
      const screenId = res.lastID;

      const seatRows = [
        ['A', 'STANDARD', 1.0], ['B', 'STANDARD', 1.0],
        ['C', 'PREMIUM', 1.5], ['D', 'PREMIUM', 1.5], ['E', 'PREMIUM', 1.5],
        ['F', 'VIP', 2.2], ['G', 'VIP', 2.2]
      ];
      for (const [rowLabel, tier, factor] of seatRows) {
        for (let num = 1; num <= 10; num++) {
          await run('INSERT INTO seats (screen_id, row_label, seat_number, seat_code, tier, base_price_factor) VALUES (?, ?, ?, ?, ?, ?)', [screenId, rowLabel, num, `${rowLabel}${num}`, tier, factor]);
        }
      }
    }

    // Concessions
    const concessions = [
      ['Golden Butter Popcorn (Large)', 'Popcorn', 'Freshly popped warm golden corn tossed in imported rich creamery butter.', 240.0, 'https://images.unsplash.com/photo-1585647347483-22b66260dfff?auto=format&fit=crop&w=400&q=80'],
      ['Gourmet Caramel Crunch Popcorn', 'Popcorn', 'Crispy artisanal mushroom corn glazed with caramelized brown sugar & sea salt.', 290.0, 'https://images.unsplash.com/photo-1578849278619-e73505e9610f?auto=format&fit=crop&w=400&q=80'],
      ['Loaded Nachos with Warm Jalapeño Cheese', 'Snacks', 'Crispy tortilla chips served with spicy melted cheese sauce and salsa mexicana.', 260.0, 'https://images.unsplash.com/photo-1513456852971-30c0b8199d4d?auto=format&fit=crop&w=400&q=80'],
      ['Crispy French Fries with Peri-Peri Dip', 'Snacks', 'Golden potato fries seasoned with smoked paprika and roasted herbs.', 210.0, 'https://images.unsplash.com/photo-1576107232684-1279f3908594?auto=format&fit=crop&w=400&q=80'],
      ['Chilled Fountain Pepsi (650ml)', 'Beverages', 'Ice-cold refreshing fountain cola with lemon wedge.', 160.0, 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=400&q=80'],
      ['Fresh Iced Peach Tea', 'Beverages', 'Brewed black tea infused with succulent natural peach essence & mint.', 190.0, 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=400&q=80'],
      ['Blockbuster Combo for Two', 'Combos', '1 Jumbo Butter Popcorn + 2 Chilled Fountain Drinks (500ml) + 1 Nachos.', 580.0, 'https://images.unsplash.com/photo-1505686994434-e3cc5abf1330?auto=format&fit=crop&w=400&q=80'],
      ['Solo Movie Lover Combo', 'Combos', '1 Medium Caramel Popcorn + 1 Chilled Beverage (500ml).', 360.0, 'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=400&q=80']
    ];
    for (const c of concessions) {
      await run('INSERT INTO concessions (name, category, description, price, image_url) VALUES (?, ?, ?, ?, ?)', c);
    }
  }

  // Ensure rolling showtimes for SQLite
  const existingShows = await all("SELECT COUNT(*) as count FROM showtimes WHERE show_date >= DATE('now', 'localtime')");
  if (existingShows[0].count < 15) {
    const moviesList = await all('SELECT id FROM movies LIMIT 6');
    const screensList = await all('SELECT id, theater_id FROM screens');
    const showHours = ['10:30:00', '14:15:00', '18:00:00', '21:45:00'];

    for (let dayOffset = 0; dayOffset <= 4; dayOffset++) {
      for (const m of moviesList) {
        for (const sc of screensList) {
          const time = showHours[(m.id + sc.id + dayOffset) % showHours.length];
          const secondTime = showHours[(m.id + sc.id + dayOffset + 2) % showHours.length];
          for (const t of [time, secondTime]) {
            const exists = await all(
              "SELECT id FROM showtimes WHERE movie_id = ? AND screen_id = ? AND show_date = DATE('now', 'localtime', '+' || ? || ' days') AND show_time = ?",
              [m.id, sc.id, dayOffset, t]
            );
            if (exists.length === 0) {
              await run(
                "INSERT INTO showtimes (movie_id, theater_id, screen_id, show_date, show_time, price_standard, price_premium, price_vip, status) VALUES (?, ?, ?, DATE('now', 'localtime', '+' || ? || ' days'), ?, 240.0, 360.0, 550.0, 'ACTIVE')",
                [m.id, sc.theater_id, sc.id, dayOffset, t]
              );
            }
          }
        }
      }
    }
  }

  console.log('[SQL DB: SQLite] SQLite live engine initialized and ready!');
  return sqlitePool;
}

module.exports = {
  initializeSqlite,
  sqlitePool
};
