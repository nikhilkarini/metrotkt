const crypto = require('crypto');

class AdminService {
  constructor(db, networkService) {
    this.db = db;
    this.networkService = networkService;
    this.adminPassword = process.env.ADMIN_PASSWORD || 'adminpassword123';
  }

  login(password) {
    if (!password || String(password).trim() !== this.adminPassword.trim()) {
      return { success: false, reason: 'Invalid administrator password.' };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    this.db.prepare(`
      INSERT INTO admin_sessions (token, created_at, expires_at)
      VALUES (?, ?, ?)
    `).run(token, now.toISOString(), expiresAt);

    return {
      success: true,
      token,
      expiresAt
    };
  }

  verifySession(token) {
    if (!token || typeof token !== 'string') return false;
    const cleanToken = token.startsWith('Bearer ') ? token.slice(7).trim() : token.trim();
    const nowIso = new Date().toISOString();
    const session = this.db.prepare(`
      SELECT * FROM admin_sessions
      WHERE token = ? AND expires_at > ?
    `).get(cleanToken, nowIso);

    return Boolean(session);
  }

  getDashboardSummary() {
    const totalStations = this.db.prepare('SELECT COUNT(*) as c FROM stations').get().c;
    const activeStations = this.db.prepare('SELECT COUNT(*) as c FROM stations WHERE is_active = 1').get().c;
    const totalConnections = this.db.prepare('SELECT COUNT(*) as c FROM connections').get().c;

    const ticketsByStatus = this.db.prepare(`
      SELECT status, COUNT(*) as count
      FROM tickets
      GROUP BY status
    `).all();

    const totalOrders = this.db.prepare('SELECT COUNT(*) as c FROM orders').get().c;
    const paidOrders = this.db.prepare("SELECT COUNT(*) as c FROM orders WHERE payment_status = 'PAID'").get().c;

    const validationStats = this.db.prepare(`
      SELECT status, COUNT(*) as count
      FROM validation_events
      GROUP BY status
    `).all();

    return {
      network: {
        totalStations,
        activeStations,
        closedStations: totalStations - activeStations,
        totalConnections
      },
      tickets: {
        totalOrders,
        paidOrders,
        byStatus: ticketsByStatus.reduce((acc, row) => ({ ...acc, [row.status]: row.count }), {})
      },
      validation: {
        byStatus: validationStats.reduce((acc, row) => ({ ...acc, [row.status]: row.count }), {})
      }
    };
  }

  getAllStations() {
    return this.db.prepare(`
      SELECT id, code, name, line_code, is_interchange, is_active, display_order
      FROM stations
      ORDER BY display_order ASC, id ASC
    `).all();
  }

  toggleStation(stationId, isActive) {
    this.db.prepare('UPDATE stations SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, Number(stationId));
    this.networkService.refreshGraph();
    return this.db.prepare('SELECT * FROM stations WHERE id = ?').get(Number(stationId));
  }

  getAllConnections() {
    return this.db.prepare(`
      SELECT c.*, s1.name as from_station_name, s2.name as to_station_name, l.name as line_name, l.color as line_color
      FROM connections c
      JOIN stations s1 ON c.from_station_id = s1.id
      JOIN stations s2 ON c.to_station_id = s2.id
      JOIN lines l ON c.line_id = l.id
      ORDER BY c.line_id ASC, c.id ASC
    `).all();
  }

  toggleConnection(connectionId, isActive) {
    this.db.prepare('UPDATE connections SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, Number(connectionId));
    this.networkService.refreshGraph();
    return this.db.prepare('SELECT * FROM connections WHERE id = ?').get(Number(connectionId));
  }

  getFareRules() {
    return this.db.prepare('SELECT * FROM fare_rules ORDER BY min_km ASC').all();
  }

  getRecentTickets(limit = 20) {
    const rows = this.db.prepare(`
      SELECT t.id, t.ticket_id, t.status, t.fare_amount, t.issued_at, t.expires_at,
             t.entered_at, t.exited_at,
             s1.name as origin_name, s2.name as destination_name
      FROM tickets t
      LEFT JOIN stations s1 ON t.origin_station_id = s1.id
      LEFT JOIN stations s2 ON t.destination_station_id = s2.id
      ORDER BY t.id DESC
      LIMIT ?
    `).all(limit);
    return rows;
  }
}

module.exports = AdminService;
