const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'queueless_ai_db',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  timezone: '+00:00'
});

pool.on('connection', (connection) => {
  connection.query("SET SESSION time_zone = '+00:00'", (err) => {
    if (err) {
      console.error('[DB] Failed to set MySQL session timezone to UTC:', err.message);
    }
  });
});

// Test connection helper
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log(`[DB] Successfully connected to MySQL database: ${process.env.DB_NAME || 'queueless_ai_db'}`);
    connection.release();
    return true;
  } catch (err) {
    console.error('[DB] MySQL Connection Failed:', err.message);
    return false;
  }
}

module.exports = {
  pool,
  testConnection
};
