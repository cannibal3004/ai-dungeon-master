#!/usr/bin/env node
require('dotenv').config({ path: '../.env' });
const path = require('path');
const pgm = require('node-pg-migrate');

pgm.default({
  databaseUrl: process.env.DATABASE_URL,
  dir: path.join(__dirname, 'migrations'),
  direction: 'up',
})
  .then(() => {
    console.log('Migration completed successfully');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });

