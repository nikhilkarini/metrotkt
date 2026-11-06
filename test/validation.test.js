const test = require('node:test');
const assert = require('node:assert/strict');
const { getDatabase } = require('../src/db/database');
const NetworkService = require('../src/services/networkService');
const TokenService = require('../src/services/tokenService');
const OrderService = require('../src/services/orderService');
const ValidationService = require('../src/services/validationService');

test('Gate Validation - Entry, Exit, State Transitions, and Slab Rules', async (t) => {
  const db = getDatabase(':memory:');
  const network = new NetworkService(db, 5);
  const tokenService = new TokenService('validation_test_secret_789');
  const orderService = new OrderService(db, network, tokenService);
  const validationService = new ValidationService(db, network, tokenService);

  const b1 = network.getStationByCode('B1'); // Origin
  const b2 = network.getStationByCode('B2'); // Intermediate (2.5 km)
  const b3 = network.getStationByCode('B3'); // Destination (5.7 km, paid ₹30 covers up to 12 km)
  const r1 = network.getStationByCode('R1'); // Off-route station

  // Buy ticket B1 -> B3
  const orderRes = orderService.createOrder({
    idempotencyKey: 'tkt_validation_idemp_1',
    originStationId: b1.id,
    destinationStationId: b3.id,
    routeMode: 'fastest'
  });

  const payRes = await orderService.simulatePayment({
    orderId: orderRes.order.orderId,
    status: 'SUCCESS'
  });

  const validToken = payRes.token;

  await t.test('entry at wrong station is rejected', () => {
    const res = validationService.validateEntry({
      tokenString: validToken,
      stationId: b2.id
    });

    assert.equal(res.success, false);
    assert.match(res.reason, /Entry is only permitted at ticket origin station/i);

    // Verify ticket remains ACTIVE
    const tkt = db.prepare('SELECT status FROM tickets WHERE id = ?').get(payRes.ticket.id);
    assert.equal(tkt.status, 'ACTIVE');
  });

  await t.test('exit before entry is rejected', () => {
    const res = validationService.validateExit({
      tokenString: validToken,
      stationId: b3.id
    });

    assert.equal(res.success, false);
    assert.match(res.reason, /not entered the network yet/i);
  });

  await t.test('entry at correct origin station succeeds and transitions state to IN_TRIP', () => {
    const res = validationService.validateEntry({
      tokenString: validToken,
      stationId: b1.id
    });

    assert.equal(res.success, true);
    assert.match(res.message, /Entry granted/i);

    // Verify DB state is IN_TRIP
    const tkt = db.prepare('SELECT status, entered_station_id FROM tickets WHERE id = ?').get(payRes.ticket.id);
    assert.equal(tkt.status, 'IN_TRIP');
    assert.equal(tkt.entered_station_id, b1.id);
  });

  await t.test('replayed/duplicate entry scan is rejected', () => {
    const res = validationService.validateEntry({
      tokenString: validToken,
      stationId: b1.id
    });

    assert.equal(res.success, false);
    assert.match(res.reason, /already in trip/i);
  });

  await t.test('exit at station not on route is rejected', () => {
    const res = validationService.validateExit({
      tokenString: validToken,
      stationId: r1.id
    });

    assert.equal(res.success, false);
    assert.match(res.reason, /not on the ticket's booked route/i);
  });

  await t.test('exit at valid destination station succeeds and transitions state to USED', () => {
    const res = validationService.validateExit({
      tokenString: validToken,
      stationId: b3.id
    });

    assert.equal(res.success, true);
    assert.match(res.message, /Exit granted/i);

    // Verify DB state is USED
    const tkt = db.prepare('SELECT status, exited_station_id FROM tickets WHERE id = ?').get(payRes.ticket.id);
    assert.equal(tkt.status, 'USED');
    assert.equal(tkt.exited_station_id, b3.id);
  });

  await t.test('replayed/duplicate exit scan is rejected', () => {
    const res = validationService.validateExit({
      tokenString: validToken,
      stationId: b3.id
    });

    assert.equal(res.success, false);
    assert.match(res.reason, /already been used/i);
  });

  // Intermediate station test
  await t.test('intermediate station exit within paid slab is accepted', async () => {
    // Buy another ticket B1 -> B6 (13.1 km, ₹40 paid, covers all)
    const b6 = network.getStationByCode('B6');
    const ord = orderService.createOrder({
      idempotencyKey: 'tkt_intermediate_test_1',
      originStationId: b1.id,
      destinationStationId: b6.id,
      routeMode: 'fastest'
    });
    const pay = await orderService.simulatePayment({
      orderId: ord.order.orderId,
      status: 'SUCCESS'
    });

    // Enter at B1
    validationService.validateEntry({ tokenString: pay.token, stationId: b1.id });

    // Exit early at intermediate station B2 (2.5 km <= 50 km)
    const exitRes = validationService.validateExit({ tokenString: pay.token, stationId: b2.id });
    assert.equal(exitRes.success, true);
    assert.match(exitRes.message, /intermediate exit accepted/i);

    const tkt = db.prepare('SELECT status, exited_station_id FROM tickets WHERE id = ?').get(pay.ticket.id);
    assert.equal(tkt.status, 'USED');
    assert.equal(tkt.exited_station_id, b2.id);
  });
});
