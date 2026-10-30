const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
require('dotenv').config();

const dbPath = path.resolve(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Could not connect to SQLite database:', err.message);
  } else {
    console.log('✅ Connected to SQLite database:', dbPath);
  }
});

// Promise wrappers for clean async/await
const dbAsync = {
  run: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  },
  get: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  all: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
};

// AES-256-CBC Encryption helpers for TOTP secret
const ENCRYPTION_KEY = Buffer.from(
  process.env.ENCRYPTION_KEY || '',
  'hex'
);
if (!/^[0-9a-f]{64}$/i.test(process.env.ENCRYPTION_KEY || '')) {
  throw new Error('ENCRYPTION_KEY must be configured as 64 hexadecimal characters.');
}
const IV_LENGTH = 16;

function encryptSecret(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptSecret(text) {
  if (!text) return null;
  const parts = text.split(':');
  if (parts.length !== 2) return null;
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = Buffer.from(parts[1], 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

async function initDatabase() {
  // Enable foreign keys
  await dbAsync.run('PRAGMA foreign_keys = ON;');

  // Users table
  await dbAsync.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT CHECK(role IN ('ADMIN', 'USER')) NOT NULL DEFAULT 'USER',
      totp_secret TEXT,
      is_2fa_enabled INTEGER DEFAULT 0,
      failed_attempts INTEGER DEFAULT 0,
      locked_until DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Stops (Pickup Points) table
  await dbAsync.run(`
    CREATE TABLE IF NOT EXISTS stops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      latitude REAL,
      longitude REAL,
      is_college INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Edges (Distances) table
  await dbAsync.run(`
    CREATE TABLE IF NOT EXISTS edges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_stop_id INTEGER NOT NULL,
      dest_stop_id INTEGER NOT NULL,
      distance_km REAL NOT NULL CHECK(distance_km > 0),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (source_stop_id) REFERENCES stops(id) ON DELETE CASCADE,
      FOREIGN KEY (dest_stop_id) REFERENCES stops(id) ON DELETE CASCADE,
      CONSTRAINT unique_edge UNIQUE (source_stop_id, dest_stop_id)
    )
  `);

  // Saved Routes table
  await dbAsync.run(`
    CREATE TABLE IF NOT EXISTS saved_routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route_name TEXT NOT NULL,
      algorithm TEXT NOT NULL,
      route_path TEXT NOT NULL,
      total_distance REAL NOT NULL,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Intruder logs table
  await dbAsync.run(`
    CREATE TABLE IF NOT EXISTS intruder_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email_attempted TEXT,
      failure_reason TEXT,
      ip_address TEXT,
      user_agent TEXT,
      photo_path TEXT,
      attempt_count INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Live Visitor logs table
  await dbAsync.run(`
    CREATE TABLE IF NOT EXISTS visitor_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      referrer TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed default data if users table is empty
  const adminCheck = await dbAsync.get('SELECT * FROM users WHERE email = ?', ['admin@college.edu']);
  if (!adminCheck) {
    const initialAdminPassword = process.env.INITIAL_ADMIN_PASSWORD;
    if (!initialAdminPassword || initialAdminPassword.length < 12) {
      throw new Error('Set INITIAL_ADMIN_PASSWORD to a unique password of at least 12 characters before first startup.');
    }

    const adminPass = await bcrypt.hash(initialAdminPassword, 10);
    await dbAsync.run(
      'INSERT INTO users (name, email, password_hash, role, is_2fa_enabled) VALUES (?, ?, ?, ?, ?)',
      ['Campus Transport Admin', 'admin@college.edu', adminPass, 'ADMIN', 0]
    );
    console.log('👤 Seeded the initial administrator account. Use the configured INITIAL_ADMIN_PASSWORD to sign in.');
  }

  // Seed default Stops if empty
  const stopsCount = await dbAsync.get('SELECT COUNT(*) as count FROM stops');
  if (stopsCount.count === 0) {
    const seedStops = [
      { name: 'College Main Campus (Central Terminal)', lat: 12.9716, lng: 77.5946, is_college: 1 },
      { name: 'Stop A - North Town Circle', lat: 12.9800, lng: 77.5800, is_college: 0 },
      { name: 'Stop B - Metro Junction', lat: 12.9900, lng: 77.6000, is_college: 0 },
      { name: 'Stop C - City Square Market', lat: 12.9650, lng: 77.6100, is_college: 0 },
      { name: 'Stop D - Tech Park Boulevard', lat: 12.9500, lng: 77.6200, is_college: 0 },
      { name: 'Stop E - Lake View Residency', lat: 12.9400, lng: 77.5850, is_college: 0 },
      { name: 'Majestic (KSR) Central Bus Terminal', lat: 12.9774, lng: 77.5708, is_college: 0 },
      { name: 'MG Road Boulevard & Metro', lat: 12.9753, lng: 77.6066, is_college: 0 },
      { name: 'Indiranagar 100ft Road Hub', lat: 12.9784, lng: 77.6408, is_college: 0 },
      { name: 'Koramangala Sony World Junction', lat: 12.9352, lng: 77.6245, is_college: 0 },
      { name: 'HSR Layout BDA Complex', lat: 12.9116, lng: 77.6389, is_college: 0 },
      { name: 'Silk Board Junction Interchange', lat: 12.9172, lng: 77.6228, is_college: 0 },
      { name: 'Electronic City Phase 1 Hub', lat: 12.8452, lng: 77.6602, is_college: 0 },
      { name: 'Jayanagar 4th Block Complex', lat: 12.9299, lng: 77.5824, is_college: 0 },
      { name: 'Banashankari TTMC Hub', lat: 12.9155, lng: 77.5736, is_college: 0 },
      { name: 'Malleshwaram 8th Cross Circle', lat: 13.0031, lng: 77.5702, is_college: 0 },
      { name: 'Yeshwanthpur Transit Terminal', lat: 13.0232, lng: 77.5503, is_college: 0 },
      { name: 'Rajajinagar 1st Block Entrance', lat: 12.9982, lng: 77.5530, is_college: 0 },
      { name: 'Hebbal Flyover Transit Junction', lat: 13.0358, lng: 77.5970, is_college: 0 },
      { name: 'Marathahalli Multiplex Bridge', lat: 12.9591, lng: 77.6974, is_college: 0 },
      { name: 'Whitefield ITPL Main Gate', lat: 12.9863, lng: 77.7289, is_college: 0 },
      { name: 'Bellandur EcoSpace Tech Hub', lat: 12.9260, lng: 77.6762, is_college: 0 }
    ];

    for (const stop of seedStops) {
      await dbAsync.run(
        'INSERT INTO stops (name, latitude, longitude, is_college) VALUES (?, ?, ?, ?)',
        [stop.name, stop.lat, stop.lng, stop.is_college]
      );
    }
    console.log('📍 Seeded 22 Google Maps pickup points.');

    // Seed test graph edges matching SRS section 12 + Google Maps road network
    const seedEdges = [
      { u: 2, v: 3, d: 4.0 },  // A-B 4 km
      { u: 2, v: 4, d: 2.0 },  // A-C 2 km
      { u: 3, v: 4, d: 1.0 },  // B-C 1 km
      { u: 3, v: 5, d: 5.0 },  // B-D 5 km
      { u: 4, v: 5, d: 8.0 },  // C-D 8 km
      { u: 5, v: 1, d: 3.0 },  // D-College 3 km
      { u: 3, v: 1, d: 9.0 },  // B-College 9 km
      { u: 4, v: 6, d: 6.0 },  // C-E 6 km
      { u: 6, v: 1, d: 7.0 },  // E-College 7 km
      // Google Maps interconnected road connections
      { u: 7, v: 1, d: 3.2 },  // Majestic - College
      { u: 7, v: 2, d: 1.6 },  // Majestic - Stop A
      { u: 7, v: 16, d: 3.8 }, // Majestic - Malleshwaram
      { u: 7, v: 18, d: 3.5 }, // Majestic - Rajajinagar
      { u: 8, v: 1, d: 1.8 },  // MG Road - College
      { u: 8, v: 3, d: 2.0 },  // MG Road - Stop B
      { u: 8, v: 4, d: 1.5 },  // MG Road - Stop C
      { u: 8, v: 9, d: 4.2 },  // MG Road - Indiranagar
      { u: 9, v: 3, d: 4.8 },  // Indiranagar - Stop B
      { u: 9, v: 5, d: 3.9 },  // Indiranagar - Stop D
      { u: 9, v: 20, d: 6.8 }, // Indiranagar - Marathahalli
      { u: 20, v: 21, d: 4.9 }, // Marathahalli - Whitefield
      { u: 20, v: 22, d: 4.6 }, // Marathahalli - Bellandur
      { u: 22, v: 12, d: 6.5 }, // Bellandur - Silk Board
      { u: 22, v: 11, d: 4.4 }, // Bellandur - HSR Layout
      { u: 10, v: 5, d: 2.2 },  // Koramangala - Stop D
      { u: 10, v: 12, d: 2.6 }, // Koramangala - Silk Board
      { u: 10, v: 11, d: 3.1 }, // Koramangala - HSR Layout
      { u: 10, v: 14, d: 5.2 }, // Koramangala - Jayanagar
      { u: 12, v: 13, d: 9.5 }, // Silk Board - Electronic City
      { u: 12, v: 11, d: 2.1 }, // Silk Board - HSR Layout
      { u: 12, v: 15, d: 6.1 }, // Silk Board - Banashankari
      { u: 12, v: 14, d: 4.8 }, // Silk Board - Jayanagar
      { u: 14, v: 15, d: 2.4 }, // Jayanagar - Banashankari
      { u: 14, v: 6, d: 1.6 },  // Jayanagar - Stop E
      { u: 15, v: 6, d: 3.2 },  // Banashankari - Stop E
      { u: 16, v: 17, d: 3.1 }, // Malleshwaram - Yeshwanthpur
      { u: 16, v: 2, d: 2.8 },  // Malleshwaram - Stop A
      { u: 16, v: 18, d: 2.2 }, // Malleshwaram - Rajajinagar
      { u: 16, v: 19, d: 4.7 }, // Malleshwaram - Hebbal
      { u: 19, v: 17, d: 5.8 }, // Hebbal - Yeshwanthpur
      { u: 19, v: 3, d: 5.4 },  // Hebbal - Stop B
      { u: 18, v: 17, d: 2.9 }, // Rajajinagar - Yeshwanthpur
      { u: 18, v: 2, d: 3.4 },  // Rajajinagar - Stop A
      { u: 1, v: 4, d: 2.1 },   // College - Stop C
      { u: 1, v: 6, d: 4.2 }    // College - Stop E
    ];

    for (const e of seedEdges) {
      await dbAsync.run(
        'INSERT INTO edges (source_stop_id, dest_stop_id, distance_km) VALUES (?, ?, ?)',
        [e.u, e.v, e.d]
      );
    }
    console.log('🛣️ Seeded 44 interconnected road network edges.');
  }
}

module.exports = {
  db,
  dbAsync,
  encryptSecret,
  decryptSecret,
  initDatabase
};
