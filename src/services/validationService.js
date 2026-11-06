const { getMaxDistanceForFare } = require('./fareService');

class ValidationService {
  constructor(db, networkService, tokenService) {
    this.db = db;
    this.networkService = networkService;
    this.tokenService = tokenService;
  }

  logValidationEvent({ ticketId, eventType, stationId, status, reason }) {
    try {
      const insertStmt = this.db.prepare(`
        INSERT INTO validation_events (ticket_id, event_type, station_id, status, reason, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      insertStmt.run(
        ticketId || 'UNKNOWN',
        eventType,
        Number(stationId) || 0,
        status,
        reason,
        new Date().toISOString()
      );
    } catch (err) {
      console.error('Failed to log validation event:', err.message);
    }
  }

  /**
   * Validate Entry scan.
   * Entry must be at origin station.
   * Atomic transition: ACTIVE -> IN_TRIP.
   */
  validateEntry({ tokenString, stationId }) {
    const targetStation = this.networkService.getStationById(Number(stationId));
    if (!targetStation) {
      return {
        success: false,
        reason: `Invalid gate station ID ${stationId}.`
      };
    }

    // 1. Verify token cryptographic signature and expiry
    const verifyResult = this.tokenService.verifyToken(tokenString, true);
    if (!verifyResult.valid) {
      const tid = verifyResult.payload?.tid || 'INVALID_TOKEN';
      this.logValidationEvent({
        ticketId: tid,
        eventType: 'ENTRY',
        stationId: targetStation.id,
        status: 'REJECTED',
        reason: verifyResult.reason
      });
      return {
        success: false,
        reason: verifyResult.reason
      };
    }

    const { tid, nonce } = verifyResult.payload;

    // 2. Fetch ticket from DB
    const ticket = this.db.prepare('SELECT * FROM tickets WHERE ticket_id = ?').get(tid);
    if (!ticket) {
      this.logValidationEvent({
        ticketId: tid,
        eventType: 'ENTRY',
        stationId: targetStation.id,
        status: 'REJECTED',
        reason: 'Ticket not found in system database.'
      });
      return {
        success: false,
        reason: 'Ticket not found in system database.'
      };
    }

    // 3. Verify nonce
    if (ticket.nonce !== nonce) {
      this.logValidationEvent({
        ticketId: tid,
        eventType: 'ENTRY',
        stationId: targetStation.id,
        status: 'REJECTED',
        reason: 'Security nonce mismatch.'
      });
      return {
        success: false,
        reason: 'Security verification failed: token credential mismatch.'
      };
    }

    // 4. Verify station rule: entry must be at origin
    if (Number(targetStation.id) !== Number(ticket.origin_station_id)) {
      const originSt = this.networkService.getStationById(ticket.origin_station_id);
      const originName = originSt ? originSt.name : `Station #${ticket.origin_station_id}`;
      const reason = `Entry is only permitted at ticket origin station '${originName}'. Scanned at '${targetStation.name}'.`;
      this.logValidationEvent({
        ticketId: tid,
        eventType: 'ENTRY',
        stationId: targetStation.id,
        status: 'REJECTED',
        reason
      });
      return {
        success: false,
        reason
      };
    }

    // 5. Verify state
    if (ticket.status === 'IN_TRIP') {
      const reason = 'Ticket is already in trip. Duplicate entry is not permitted.';
      this.logValidationEvent({
        ticketId: tid,
        eventType: 'ENTRY',
        stationId: targetStation.id,
        status: 'REJECTED',
        reason
      });
      return {
        success: false,
        reason
      };
    }

    if (ticket.status === 'USED') {
      const reason = 'Ticket has already been used and journey completed.';
      this.logValidationEvent({
        ticketId: tid,
        eventType: 'ENTRY',
        stationId: targetStation.id,
        status: 'REJECTED',
        reason
      });
      return {
        success: false,
        reason
      };
    }

    if (ticket.status !== 'ACTIVE') {
      const reason = `Ticket cannot be used (status: ${ticket.status}).`;
      this.logValidationEvent({
        ticketId: tid,
        eventType: 'ENTRY',
        stationId: targetStation.id,
        status: 'REJECTED',
        reason
      });
      return {
        success: false,
        reason
      };
    }

    // 6. Atomic state transition: ACTIVE -> IN_TRIP
    const nowIso = new Date().toISOString();
    const updateStmt = this.db.prepare(`
      UPDATE tickets
      SET status = 'IN_TRIP', entered_station_id = ?, entered_at = ?
      WHERE ticket_id = ? AND status = 'ACTIVE'
    `);

    const result = updateStmt.run(targetStation.id, nowIso, tid);
    if (result.changes === 0) {
      const reason = 'Concurrent scan conflict or ticket status was modified.';
      this.logValidationEvent({
        ticketId: tid,
        eventType: 'ENTRY',
        stationId: targetStation.id,
        status: 'REJECTED',
        reason
      });
      return {
        success: false,
        reason
      };
    }

    const successMessage = `Entry granted at ${targetStation.name}. Gate opened.`;
    this.logValidationEvent({
      ticketId: tid,
      eventType: 'ENTRY',
      stationId: targetStation.id,
      status: 'SUCCESS',
      reason: successMessage
    });

    return {
      success: true,
      message: successMessage,
      ticketId: tid,
      stationName: targetStation.name,
      timestamp: nowIso
    };
  }

  /**
   * Validate Exit scan.
   * Exit allowed at destination or intermediate station within paid slab.
   * Once in trip, exit is allowed without automatic timeout.
   * Atomic transition: IN_TRIP -> USED.
   */
  validateExit({ tokenString, stationId }) {
    const targetStation = this.networkService.getStationById(Number(stationId));
    if (!targetStation) {
      return {
        success: false,
        reason: `Invalid gate station ID ${stationId}.`
      };
    }

    // 1. Verify token signature.
    // For exit during trip, checkExpiry = false so passenger completes exit without sudden trip timeout.
    const verifyResult = this.tokenService.verifyToken(tokenString, false);
    if (!verifyResult.valid) {
      const tid = verifyResult.payload?.tid || 'INVALID_TOKEN';
      this.logValidationEvent({
        ticketId: tid,
        eventType: 'EXIT',
        stationId: targetStation.id,
        status: 'REJECTED',
        reason: verifyResult.reason
      });
      return {
        success: false,
        reason: verifyResult.reason
      };
    }

    const { tid, nonce } = verifyResult.payload;

    // 2. Fetch ticket
    const ticket = this.db.prepare('SELECT * FROM tickets WHERE ticket_id = ?').get(tid);
    if (!ticket) {
      this.logValidationEvent({
        ticketId: tid,
        eventType: 'EXIT',
        stationId: targetStation.id,
        status: 'REJECTED',
        reason: 'Ticket not found in system database.'
      });
      return {
        success: false,
        reason: 'Ticket not found in system database.'
      };
    }

    // 3. Verify nonce
    if (ticket.nonce !== nonce) {
      this.logValidationEvent({
        ticketId: tid,
        eventType: 'EXIT',
        stationId: targetStation.id,
        status: 'REJECTED',
        reason: 'Security nonce mismatch.'
      });
      return {
        success: false,
        reason: 'Security verification failed: token credential mismatch.'
      };
    }

    // 4. Verify state
    if (ticket.status === 'ACTIVE') {
      const reason = 'Ticket has not entered the network yet. No entry record found.';
      this.logValidationEvent({
        ticketId: tid,
        eventType: 'EXIT',
        stationId: targetStation.id,
        status: 'REJECTED',
        reason
      });
      return {
        success: false,
        reason
      };
    }

    if (ticket.status === 'USED') {
      const reason = 'Ticket has already been used to exit. Duplicate exit is not permitted.';
      this.logValidationEvent({
        ticketId: tid,
        eventType: 'EXIT',
        stationId: targetStation.id,
        status: 'REJECTED',
        reason
      });
      return {
        success: false,
        reason
      };
    }

    if (ticket.status !== 'IN_TRIP') {
      const reason = `Ticket cannot be exited (current status: ${ticket.status}).`;
      this.logValidationEvent({
        ticketId: tid,
        eventType: 'EXIT',
        stationId: targetStation.id,
        status: 'REJECTED',
        reason
      });
      return {
        success: false,
        reason
      };
    }

    // 5. Station & Fare rule check
    // Parse route snapshot to check intermediate vs destination stations and distances
    const route = JSON.parse(ticket.route_snapshot);
    const orderedStations = route.orderedStations || [];
    const stationIndex = orderedStations.findIndex(s => Number(s.id) === Number(targetStation.id));

    if (stationIndex === -1) {
      const reason = `Station '${targetStation.name}' is not on the ticket's booked route.`;
      this.logValidationEvent({
        ticketId: tid,
        eventType: 'EXIT',
        stationId: targetStation.id,
        status: 'REJECTED',
        reason
      });
      return {
        success: false,
        reason
      };
    }

    if (stationIndex === 0) {
      const reason = `Cannot exit at the trip origin station '${targetStation.name}'.`;
      this.logValidationEvent({
        ticketId: tid,
        eventType: 'EXIT',
        stationId: targetStation.id,
        status: 'REJECTED',
        reason
      });
      return {
        success: false,
        reason
      };
    }

    // Check if intermediate station
    const isDestination = stationIndex === orderedStations.length - 1;
    if (!isDestination) {
      // Calculate distance traveled from origin up to this intermediate station
      // Find route distance from origin to this station
      let distanceTraveled = 0;
      try {
        const subRoute = this.networkService.findRoute(ticket.origin_station_id, targetStation.id, route.routeMode || 'fastest');
        distanceTraveled = subRoute.totalDistanceKm;
      } catch {
        distanceTraveled = 0;
      }

      const maxAllowedDistance = getMaxDistanceForFare(ticket.fare_amount);
      if (distanceTraveled > maxAllowedDistance) {
        const reason = `Distance traveled (${distanceTraveled} km) exceeds the paid fare slab limit (${maxAllowedDistance} km).`;
        this.logValidationEvent({
          ticketId: tid,
          eventType: 'EXIT',
          stationId: targetStation.id,
          status: 'REJECTED',
          reason
        });
        return {
          success: false,
          reason
        };
      }
    }

    // 6. Atomic state transition: IN_TRIP -> USED
    const nowIso = new Date().toISOString();
    const updateStmt = this.db.prepare(`
      UPDATE tickets
      SET status = 'USED', exited_station_id = ?, exited_at = ?
      WHERE ticket_id = ? AND status = 'IN_TRIP'
    `);

    const result = updateStmt.run(targetStation.id, nowIso, tid);
    if (result.changes === 0) {
      const reason = 'Concurrent scan conflict or ticket status was modified.';
      this.logValidationEvent({
        ticketId: tid,
        eventType: 'EXIT',
        stationId: targetStation.id,
        status: 'REJECTED',
        reason
      });
      return {
        success: false,
        reason
      };
    }

    const isIntermediateNotice = !isDestination ? ' (Early intermediate exit accepted within paid fare)' : '';
    const successMessage = `Exit granted at ${targetStation.name}${isIntermediateNotice}. Gate opened. Journey complete.`;

    this.logValidationEvent({
      ticketId: tid,
      eventType: 'EXIT',
      stationId: targetStation.id,
      status: 'SUCCESS',
      reason: successMessage
    });

    return {
      success: true,
      message: successMessage,
      ticketId: tid,
      stationName: targetStation.name,
      timestamp: nowIso
    };
  }

  getValidationEvents(limit = 50) {
    return this.db.prepare(`
      SELECT v.*, s.name as station_name
      FROM validation_events v
      LEFT JOIN stations s ON v.station_id = s.id
      ORDER BY v.id DESC
      LIMIT ?
    `).all(limit);
  }
}

module.exports = ValidationService;
