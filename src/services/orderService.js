const { calculateFare } = require('./fareService');

class OrderService {
  constructor(db, networkService, tokenService) {
    this.db = db;
    this.networkService = networkService;
    this.tokenService = tokenService;
  }

  /**
   * Creates an order idempotently.
   * Server recalculates route and fare, ignoring any browser-provided amounts.
   */
  createOrder({ idempotencyKey, originStationId, destinationStationId, routeMode = 'fastest' }) {
    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      throw new Error('Idempotency key is required.');
    }
    const cleanKey = idempotencyKey.trim();

    // Check existing order with this key
    const existingOrder = this.db.prepare('SELECT * FROM orders WHERE idempotency_key = ?').get(cleanKey);
    if (existingOrder) {
      const existingTicket = this.db.prepare('SELECT * FROM tickets WHERE order_id = ?').get(existingOrder.id);
      return {
        isDuplicate: true,
        order: this.formatOrder(existingOrder),
        ticket: existingTicket ? this.formatTicket(existingTicket) : null
      };
    }

    // Recalculate route and fare strictly on server
    const route = this.networkService.findRoute(Number(originStationId), Number(destinationStationId), routeMode);
    const fare = calculateFare(route.totalDistanceKm);

    const orderId = this.tokenService.generateOrderId();
    const createdAt = new Date().toISOString();

    const insertStmt = this.db.prepare(`
      INSERT INTO orders (
        order_id, idempotency_key, origin_station_id, destination_station_id,
        route_mode, route_snapshot, fare_amount, payment_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
    `);

    const result = insertStmt.run(
      orderId,
      cleanKey,
      route.origin.id,
      route.destination.id,
      route.routeMode,
      JSON.stringify(route),
      fare.fareInr,
      createdAt
    );

    const createdOrder = this.db.prepare('SELECT * FROM orders WHERE id = ?').get(result.lastInsertRowid);
    return {
      isDuplicate: false,
      order: this.formatOrder(createdOrder),
      ticket: null
    };
  }

  /**
   * Simulates payment for an order.
   * If already paid, returns existing ticket without duplicates.
   */
  async simulatePayment({ orderId, status = 'SUCCESS' }) {
    const order = this.db.prepare('SELECT * FROM orders WHERE order_id = ?').get(orderId);
    if (!order) {
      throw new Error(`Order '${orderId}' not found.`);
    }

    // If order is already paid, return existing ticket
    if (order.payment_status === 'PAID') {
      const existingTicket = this.db.prepare('SELECT * FROM tickets WHERE order_id = ?').get(order.id);
      if (existingTicket) {
        const expSec = Math.floor(new Date(existingTicket.expires_at).getTime() / 1000);
        const token = this.tokenService.createSignedToken(existingTicket.ticket_id, existingTicket.nonce, expSec);
        const qrDataUrl = await this.tokenService.generateQrCodeDataUrl(token);

        return {
          success: true,
          alreadyPaid: true,
          order: this.formatOrder(order),
          ticket: this.formatTicket(existingTicket),
          token,
          qrDataUrl
        };
      }
    }

    const simStatus = String(status).toUpperCase();
    if (simStatus === 'FAILED') {
      this.db.prepare("UPDATE orders SET payment_status = 'FAILED' WHERE id = ?").run(order.id);
      const updatedOrder = this.db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
      return {
        success: false,
        message: 'Simulated payment was marked as failed.',
        order: this.formatOrder(updatedOrder)
      };
    }

    if (simStatus !== 'SUCCESS') {
      throw new Error("Invalid payment simulation status. Must be 'SUCCESS' or 'FAILED'.");
    }

    // Atomic execution: Mark order paid and issue 1 ticket
    let issuedTicket = null;
    let signedToken = null;
    let qrDataUrl = null;

    const issueTx = this.db.transaction(() => {
      this.db.prepare("UPDATE orders SET payment_status = 'PAID' WHERE id = ?").run(order.id);

      const ticketId = this.tokenService.generateTicketId();
      const guestAccessToken = this.tokenService.generateGuestAccessToken();
      const nonce = this.tokenService.generateNonce();
      const issuedAt = new Date().toISOString();
      // 120-minute validity for unused ticket
      const expiryMs = Date.now() + 120 * 60 * 1000;
      const expiresAt = new Date(expiryMs).toISOString();
      const expSec = Math.floor(expiryMs / 1000);

      const insertTicket = this.db.prepare(`
        INSERT INTO tickets (
          ticket_id, order_id, guest_access_token, nonce,
          origin_station_id, destination_station_id, route_snapshot,
          fare_amount, status, issued_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
      `);

      const res = insertTicket.run(
        ticketId,
        order.id,
        guestAccessToken,
        nonce,
        order.origin_station_id,
        order.destination_station_id,
        order.route_snapshot,
        order.fare_amount,
        issuedAt,
        expiresAt
      );

      issuedTicket = this.db.prepare('SELECT * FROM tickets WHERE id = ?').get(res.lastInsertRowid);
      signedToken = this.tokenService.createSignedToken(ticketId, nonce, expSec);
    });

    issueTx();

    qrDataUrl = await this.tokenService.generateQrCodeDataUrl(signedToken);
    const updatedOrder = this.db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);

    return {
      success: true,
      order: this.formatOrder(updatedOrder),
      ticket: this.formatTicket(issuedTicket),
      token: signedToken,
      qrDataUrl
    };
  }

  getTicketById(ticketId, guestAccessToken = null) {
    let ticket;
    if (guestAccessToken) {
      ticket = this.db.prepare('SELECT * FROM tickets WHERE ticket_id = ? AND guest_access_token = ?').get(ticketId, guestAccessToken);
    } else {
      ticket = this.db.prepare('SELECT * FROM tickets WHERE ticket_id = ?').get(ticketId);
    }
    if (!ticket) return null;
    return this.formatTicket(ticket);
  }

  formatOrder(row) {
    if (!row) return null;
    return {
      id: row.id,
      orderId: row.order_id,
      idempotencyKey: row.idempotency_key,
      originStationId: row.origin_station_id,
      destinationStationId: row.destination_station_id,
      routeMode: row.route_mode,
      route: JSON.parse(row.route_snapshot),
      fareAmount: row.fare_amount,
      paymentStatus: row.payment_status,
      createdAt: row.created_at
    };
  }

  formatTicket(row) {
    if (!row) return null;
    return {
      id: row.id,
      ticketId: row.ticket_id,
      orderId: row.order_id,
      guestAccessToken: row.guest_access_token,
      nonce: row.nonce,
      originStationId: row.origin_station_id,
      destinationStationId: row.destination_station_id,
      route: JSON.parse(row.route_snapshot),
      fareAmount: row.fare_amount,
      status: row.status,
      issuedAt: row.issued_at,
      expiresAt: row.expires_at,
      enteredStationId: row.entered_station_id,
      enteredAt: row.entered_at,
      exitedStationId: row.exited_station_id,
      exitedAt: row.exited_at
    };
  }
}

module.exports = OrderService;
