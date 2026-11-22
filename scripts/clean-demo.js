/**
 * Standalone script to clean demo bookings from the database
 * Run via: npm run clean-demo
 */
require('dotenv').config();
const { initializeDatabase, cleanDemoData } = require('../db/connection');

async function run() {
  try {
    console.log('--- CinePass Database Cleanup ---');
    await initializeDatabase();
    const result = await cleanDemoData();
    console.log(result.message);
    console.log('✅ Database is now 100% clean and ready for live production!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Cleanup failed:', err.message);
    process.exit(1);
  }
}

run();

