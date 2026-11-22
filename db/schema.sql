-- ===================================================================
-- CinePass - Online Movie Ticket Booking System
-- Database Schema for MySQL 8.0+
-- ===================================================================

CREATE DATABASE IF NOT EXISTS movie_booking_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE movie_booking_db;

-- 1. Movies Table
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

-- 2. Theaters Table
CREATE TABLE IF NOT EXISTS theaters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  chain VARCHAR(50) DEFAULT 'PVR',
  city VARCHAR(100) DEFAULT 'Mumbai',
  address VARCHAR(255) NOT NULL,
  amenities VARCHAR(255) DEFAULT 'Dolby Atmos, 4K Laser, Recliners, Gourmet Food',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 3. Screens Table
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

-- 4. Seats Table (Physical layout of each screen)
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

-- 5. Showtimes Table
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

-- 6. Concessions (F&B / Snacks) Table
CREATE TABLE IF NOT EXISTS concessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  category ENUM('Popcorn', 'Beverages', 'Snacks', 'Combos') NOT NULL,
  description VARCHAR(255),
  price DECIMAL(8,2) NOT NULL,
  image_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 7. Bookings Table
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

-- 8. Booking Seats (Maps individual seats booked for each showtime)
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

