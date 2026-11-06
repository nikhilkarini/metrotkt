const Database = require('better-sqlite3');
const path = require('path');

function getDatabase(customPath) {
  const dbFile = customPath || process.env.DATABASE_FILE || 'metro_afc.db';
  const db = new Database(dbFile);
  // Enable WAL mode for better concurrency and foreign keys
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initDatabase(db);
  seedDatabase(db);
  return db;
}

function initDatabase(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS lines (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      line_code TEXT NOT NULL,
      is_interchange INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      display_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_station_id INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
      to_station_id INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
      line_id TEXT NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
      distance_km REAL NOT NULL,
      travel_minutes REAL NOT NULL,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS fare_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      min_km REAL NOT NULL,
      max_km REAL,
      fare_inr INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT UNIQUE NOT NULL,
      idempotency_key TEXT UNIQUE NOT NULL,
      origin_station_id INTEGER NOT NULL REFERENCES stations(id),
      destination_station_id INTEGER NOT NULL REFERENCES stations(id),
      route_mode TEXT NOT NULL,
      route_snapshot TEXT NOT NULL,
      fare_amount INTEGER NOT NULL,
      payment_status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT UNIQUE NOT NULL,
      order_id INTEGER UNIQUE NOT NULL REFERENCES orders(id),
      guest_access_token TEXT UNIQUE NOT NULL,
      nonce TEXT NOT NULL,
      origin_station_id INTEGER NOT NULL REFERENCES stations(id),
      destination_station_id INTEGER NOT NULL REFERENCES stations(id),
      route_snapshot TEXT NOT NULL,
      fare_amount INTEGER NOT NULL,
      status TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      entered_station_id INTEGER REFERENCES stations(id),
      entered_at TEXT,
      exited_station_id INTEGER REFERENCES stations(id),
      exited_at TEXT
    );

    CREATE TABLE IF NOT EXISTS validation_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      station_id INTEGER NOT NULL REFERENCES stations(id),
      status TEXT NOT NULL,
      reason TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_connections_from ON connections(from_station_id);
    CREATE INDEX IF NOT EXISTS idx_connections_to ON connections(to_station_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_ticket_id ON tickets(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_token ON tickets(guest_access_token);
    CREATE INDEX IF NOT EXISTS idx_orders_idemp ON orders(idempotency_key);
    CREATE INDEX IF NOT EXISTS idx_validation_ticket ON validation_events(ticket_id);
  `);
}

function seedDatabase(db) {
  const lineCount = db.prepare('SELECT COUNT(*) as count FROM lines').get().count;
  if (lineCount > 0) {
    return; // Already seeded
  }

  const insertLine = db.prepare('INSERT INTO lines (id, name, color) VALUES (?, ?, ?)');
  const insertStation = db.prepare(
    'INSERT INTO stations (code, name, line_code, is_interchange, is_active, display_order) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertConnection = db.prepare(
    'INSERT INTO connections (from_station_id, to_station_id, line_id, distance_km, travel_minutes, is_active) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertFareRule = db.prepare(
    'INSERT INTO fare_rules (min_km, max_km, fare_inr) VALUES (?, ?, ?)'
  );

  const seedTx = db.transaction(() => {
    // 1. Lines
    insertLine.run('BLUE', 'Blue Line', '#0284c7');
    insertLine.run('RED', 'Red Line', '#ef4444');

    // 2. Stations (Two lines, six stations each, one shared interchange: Central Junction)
    // Blue Line sequence: B1, B2, B3, CJ, B5, B6 (6 stations)
    // Red Line sequence: R1, R2, CJ, R4, R5, R6 (6 stations)
    const stations = [
      { code: 'B1', name: 'Bayview', line: 'BLUE', isInterchange: 0, order: 1 },
      { code: 'B2', name: 'Harbor Point', line: 'BLUE', isInterchange: 0, order: 2 },
      { code: 'B3', name: 'Tech Park', line: 'BLUE', isInterchange: 0, order: 3 },
      { code: 'CJ', name: 'Central Junction', line: 'BLUE,RED', isInterchange: 1, order: 4 },
      { code: 'B5', name: 'Market Square', line: 'BLUE', isInterchange: 0, order: 5 },
      { code: 'B6', name: 'Sunrise Hills', line: 'BLUE', isInterchange: 0, order: 6 },
      { code: 'R1', name: 'Airport City', line: 'RED', isInterchange: 0, order: 11 },
      { code: 'R2', name: 'Aero Club', line: 'RED', isInterchange: 0, order: 12 },
      { code: 'R4', name: 'Grand University', line: 'RED', isInterchange: 0, order: 14 },
      { code: 'R5', name: 'Green Meadows', line: 'RED', isInterchange: 0, order: 15 },
      { code: 'R6', name: 'South Park', line: 'RED', isInterchange: 0, order: 16 }
    ];

    const stationMap = {};
    for (const s of stations) {
      const res = insertStation.run(s.code, s.name, s.line, s.isInterchange, 1, s.order);
      stationMap[s.code] = res.lastInsertRowid;
    }

    // 3. Bidirectional Connections
    const edges = [
      // Blue Line
      { from: 'B1', to: 'B2', line: 'BLUE', dist: 2.5, mins: 4.0 },
      { from: 'B2', to: 'B3', line: 'BLUE', dist: 3.2, mins: 5.0 },
      { from: 'B3', to: 'CJ', line: 'BLUE', dist: 2.1, mins: 3.5 },
      { from: 'CJ', to: 'B5', line: 'BLUE', dist: 1.8, mins: 3.0 },
      { from: 'B5', to: 'B6', line: 'BLUE', dist: 3.5, mins: 5.5 },
      // Red Line
      { from: 'R1', to: 'R2', line: 'RED', dist: 4.0, mins: 6.0 },
      { from: 'R2', to: 'CJ', line: 'RED', dist: 3.0, mins: 4.5 },
      { from: 'CJ', to: 'R4', line: 'RED', dist: 2.4, mins: 3.5 },
      { from: 'R4', to: 'R5', line: 'RED', dist: 2.8, mins: 4.0 },
      { from: 'R5', to: 'R6', line: 'RED', dist: 3.3, mins: 5.0 }
    ];

    for (const e of edges) {
      const u = stationMap[e.from];
      const v = stationMap[e.to];
      // Insert forward
      insertConnection.run(u, v, e.line, e.dist, e.mins, 1);
      // Insert reverse
      insertConnection.run(v, u, e.line, e.dist, e.mins, 1);
    }

    // 4. Fare Rules
    // [0, 2) km -> ₹10
    // [2, 5) km -> ₹20
    // [5, 12) km -> ₹30
    // [12, null) km -> ₹40
    insertFareRule.run(0, 2, 10);
    insertFareRule.run(2, 5, 20);
    insertFareRule.run(5, 12, 30);
    insertFareRule.run(12, null, 40);
  });

  seedTx();
}

module.exports = {
  getDatabase,
  initDatabase,
  seedDatabase
};
