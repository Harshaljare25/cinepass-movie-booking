# 🎬 CinePass - Online Movie Ticket Booking Platform

A full-stack, production-grade web-based movie ticket booking application built with **HTML5**, **CSS3**, modern **Vanilla JavaScript**, and a **Live MySQL 8.0 Relational Database**.

---

## 🌟 Key Features

### 1. 🎟️ Cinematic User Interface (Frontend)
- **Cinematic Dark Luxury Theme**: Custom glassmorphism, glowing cinema red accents (`#e50914`), luxury gold VIP badges, and smooth micro-animations.
- **Hero Billboard Showcase**: Rotating carousel of featured blockbusters with ratings, runtimes, formats (`IMAX with Laser`, `Dolby Cinema`, `4DX`), and synopsis.
- **Trailer Lightbox Modal**: Integrated high-definition video previews directly on the homepage.
- **Search & Multi-Filter**: Filter movies instantly by genre (*Action, Sci-Fi, Drama, Comedy, Animation*), format, or keyword search with live debouncing.

### 2. 💺 Interactive Live Seat Map & Tier Selection
- **Realistic Cinema Curved Projection Screen**: Visual curved screen indicator (*"ALL EYES THIS WAY"*).
- **Multi-Tier Seat Matrix**:
  - **VIP Recliners** (Rows G, F) - Ultra plush recliners with gold styling.
  - **Premium Club** (Rows E, D, C) - Center view seats with optimal sound staging.
  - **Standard** (Rows B, A) - Front rows with standard cinema seating.
  - **Aisle Spacing**: Realistic aisle separation between seat 5 and 6.
- **Live Seat Status Tracking**:
  - 🟢 **Available** (clickable, price tooltip)
  - 🔴 **Selected** (vibrant glowing pulse animation)
  - ⚪ **Booked / Occupied** (greyed-out, unclickable, locked by MySQL)

### 3. 🍿 Gourmet Cinema Concessions (Add-ons)
- Pre-order hot buttered popcorn, artisanal caramel crunch, loaded nachos with warm jalapeño cheese, crispy peri-peri fries, iced fountain beverages, and blockbuster combos.
- Dynamic quantity steppers with live total calculation.

### 4. 💳 Frictionless Checkout & Promo Codes
- Dynamic subtotal, convenience fee (incl. GST), and real-time coupon deduction:
  - `CINEMA50`: Flat ₹50 instant discount.
  - `FIRST100`: Flat ₹100 instant discount.
  - `VIP20`: 20% off entire ticket and concessions order.
- Multi-payment simulation: Credit/Debit Card, UPI / Instant QR Code, Net Banking, Digital Wallets.

### 5. 📱 Scannable Digital E-Ticket & Boarding Pass
- Generates unique reference code (e.g., `CP-24857644`).
- **Dynamic Scannable QR Code** rendered on the fly with high error correction.
- Cinema turnstile barcode line.
- Complete breakdown: Guest name, movie poster, show date & time, auditorium, seats, total paid.
- **Print / Save PDF Mode**: Clean print stylesheet (`@media print`) designed as a 1-page admission boarding pass.
- Celebration confetti animation upon successful booking.

### 6. 🔄 Booking Management & Live Seat Release
- Look up any reservation by booking reference, email, or phone.
- **Live Cancellation**: Cancelling a booking updates the MySQL status to `CANCELLED` and immediately releases the reserved seats back into the live inventory so other users can book them in real time!

### 7. 🛡️ Live MySQL Relational Database & ACID Concurrency
- Strict Foreign Keys, cascading rules, and unique constraints.
- **Zero Double-Booking Guarantee**: Bookings use SQL transactions (`START TRANSACTION`, row locks `FOR UPDATE`, `COMMIT` / `ROLLBACK`). If two users click the same seat at the same second, only one succeeds and the other receives a conflict notification.
- **Rolling Showtimes**: Automatically generates active theatrical showtimes for today and upcoming dates relative to `CURDATE()` so the site is always active.

### 8. 📊 Admin Dashboard & Live SQL Query Sandbox
- **KPI Metrics**: Real-time revenue, total tickets sold, confirmed bookings count, and active showtimes.
- **Live Bookings Feed**: Manage and review all bookings directly from the database.
- **Add New Movie**: Form to insert movies into MySQL with automatic rolling showtime generation.
- **Live SQL Query Sandbox**: Run custom `SELECT`, `SHOW`, `DESCRIBE`, or `EXPLAIN` queries right in your browser! Displays execution time in milliseconds, row counts, column names, and tabular results.

---

## 🏗️ Relational Database Schema (MySQL 8.0)

The system includes **8 normalized tables**:

| Table | Purpose |
|---|---|
| `movies` | Movie titles, slug, genres, duration, ratings, certification, poster & banner URLs, trailer links. |
| `theaters` | Cinema locations, chains (PVR, Cinépolis, Carnival), city, addresses, and sound/screen amenities. |
| `screens` | Auditoriums (IMAX Laser, 4DX, Dolby Cinema, VIP Suites) and capacity. |
| `seats` | Physical seat grid layout for each screen (row, seat number, code e.g. `F4`, tier e.g. `VIP`). |
| `showtimes` | Movie-screen-theater mappings with scheduled date, time slot, and tier prices. |
| `concessions` | Food, snacks, beverages, and combo items with pricing and image URLs. |
| `bookings` | Customer details, showtime reference, seats list, subtotal, convenience fee, discounts, total, status (`CONFIRMED`, `CANCELLED`). |
| `booking_seats` | Normalized mapping of each booked seat to its booking and showtime. Unique constraint `(showtime_id, seat_code)` prevents seat collisions. |

The raw SQL schema script is located at:
[`db/schema.sql`](file:///c:/Users/Harshal/OneDrive/Desktop/SIP%20Project/db/schema.sql)

---

## 📁 Project Structure

```
SIP Project/
├── package.json               # Dependencies and run scripts
├── .env                       # Environment configuration (Port, MySQL credentials)
├── server.js                  # Express 5 backend with REST APIs & live MySQL connection
├── db/
│   ├── schema.sql             # MySQL schema definitions
│   └── connection.js          # MySQL connection pool, auto-migration & seed engine
├── public/                    # Frontend client files
│   ├── index.html             # Homepage: Browse movies, hero showcase, trailers, search
│   ├── booking.html           # Showtime selector, interactive seat matrix, concessions, checkout
│   ├── confirmation.html      # Digital e-ticket, dynamic QR code, confetti, print/PDF
│   ├── my-bookings.html       # Booking lookup, history, and real-time cancellation
│   ├── admin.html             # Admin analytics, movie manager, interactive SQL sandbox
│   ├── css/
│   │   ├── style.css          # Global dark luxury cinema theme & components
│   │   ├── seat-map.css       # Curved screen, tiered seat matrix, checkout modal
│   │   └── admin.css          # Admin panel, metrics cards, tables, SQL console
│   └── js/
│       ├── api.js             # API helper, toast notifications, formatters
│       ├── main.js            # Homepage billboard, movie grid filters, trailer modal
│       ├── booking.js         # Seat selection state, concessions, checkout logic
│       ├── confirmation.js    # QR code generator, ticket rendering, print handler
│       ├── my-bookings.js     # Search bookings, cancel booking & seat release
│       └── admin.js           # Live SQL query executor, KPI charts, movie insertion
└── README.md                  # Comprehensive documentation
```

---

## 🚀 Running the Application

### 1. Prerequisites
- **Node.js** (v18+)
- **MySQL 8.0** running on `localhost:3306` with user `root` (password `root`, or edit `.env`).

### 2. Start the Server
Run in PowerShell / terminal:
```powershell
node server.js
```
or
```powershell
cmd /c npm start
```

### 3. Open in Browser
Visit:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 🧪 Testing the Live SQL Features

1. **Book a Ticket**:
   - Go to `http://localhost:3000`.
   - Click **Book Tickets** on any movie (e.g. *Dune: Part Two* or *Spider-Man*).
   - Pick a theater & showtime.
   - Choose your seats on the live matrix (e.g. VIP seats `F5`, `F6`).
   - Click **Proceed to Checkout**, enter contact details, try promo code `CINEMA50`, and confirm!
   - You will see the confirmed digital e-ticket pass with dynamic QR code!

2. **Inspect the Live SQL Database in the Admin Portal**:
   - Open `http://localhost:3000/admin.html` and click **Live SQL Console**.
   - Click any sample query pill or type:
     ```sql
     SELECT booking_reference, customer_name, seat_count, seats_list, total_amount, booking_status 
     FROM bookings 
     ORDER BY id DESC LIMIT 10;
     ```
   - Hit **Execute SQL** to see the database return the real live records in milliseconds!

3. **Test Instant Seat Release on Cancellation**:
   - Go to **My Bookings** (`http://localhost:3000/my-bookings.html`).
   - Click **Cancel Booking** on your reservation.
   - Notice that the booking is cancelled, and if you open the showtime seat map again, those seats are immediately **Available** once more!

