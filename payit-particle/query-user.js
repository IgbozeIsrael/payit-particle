const db = require('./src/db.js');
const users = db.db.prepare("SELECT user_id, telegram_id, first_name, last_name, business_email, business_name, is_verified, nin FROM users LIMIT 10").all();
console.log(JSON.stringify(users, null, 2));
