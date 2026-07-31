#!/usr/bin/env node
require('dotenv').config();
const db = require('./src/db');

const user = db.db.prepare("SELECT * FROM users WHERE business_email LIKE '%igboze%'").get();
console.log('User record:');
if (user) {
  Object.keys(user).forEach(k => {
    console.log(`  ${k}: ${user[k]}`);
  });
} else {
  console.log('  NOT FOUND');
}
