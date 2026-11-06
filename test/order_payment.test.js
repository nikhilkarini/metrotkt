const test = require('node:test');
const assert = require('node:assert/strict');
const { getDatabase } = require('../src/db/database');
const NetworkService = require('../src/services/networkService');
const TokenService = require('../src/services/tokenService');
const OrderService = require('../src/services/orderService');

test('Order and Payment Simulation - Idempotency and State', async (t) => {
  const db = getDatabase(':memory:');
  const network = new NetworkService(db, 5);
  const tokenService = new TokenService('test_secret_for_orders_123');
  const orderService = new OrderService(db, network, tokenService);

  const b1 = network.getStationByCode('B1');
  const b3 = network.getStationByCode('B3');

  const idempotencyKey = 'req_idemp_abc_12345';

  let orderResult;

  await t.test('creates new order recalculating server fare', () => {
    orderResult = orderService.createOrder({
      idempotencyKey,
      originStationId: b1.id,
      destinationStationId: b3.id,
      routeMode: 'fastest'
    });

    assert.equal(orderResult.isDuplicate, false);
    assert.equal(orderResult.order.idempotencyKey, idempotencyKey);
    assert.equal(orderResult.order.paymentStatus, 'PENDING');
    // Distance B1->B3 is 5.7 km -> Fare slab [5, 12) km is ₹30
    assert.equal(orderResult.order.fareAmount, 30);
  });

  await t.test('idempotent retry with same key returns existing order without creating new row', () => {
    const retryResult = orderService.createOrder({
      idempotencyKey,
      originStationId: b1.id,
      destinationStationId: b3.id,
      routeMode: 'fastest'
    });

    assert.equal(retryResult.isDuplicate, true);
    assert.equal(retryResult.order.id, orderResult.order.id);
    assert.equal(retryResult.order.orderId, orderResult.order.orderId);

    // Verify order count in DB is still 1
    const count = db.prepare('SELECT COUNT(*) as c FROM orders').get().c;
    assert.equal(count, 1);
  });

  await t.test('simulated payment failure marks order failed and creates no ticket', async () => {
    const failRes = await orderService.simulatePayment({
      orderId: orderResult.order.orderId,
      status: 'FAILED'
    });

    assert.equal(failRes.success, false);
    assert.equal(failRes.order.paymentStatus, 'FAILED');

    // Confirm no ticket created
    const ticketCount = db.prepare('SELECT COUNT(*) as c FROM tickets').get().c;
    assert.equal(ticketCount, 0);
  });

  await t.test('simulated payment success marks order paid and issues 1 ticket', async () => {
    const successRes = await orderService.simulatePayment({
      orderId: orderResult.order.orderId,
      status: 'SUCCESS'
    });

    assert.equal(successRes.success, true);
    assert.equal(successRes.order.paymentStatus, 'PAID');
    assert.ok(successRes.ticket);
    assert.equal(successRes.ticket.status, 'ACTIVE');
    assert.equal(successRes.ticket.fareAmount, 30);
    assert.ok(successRes.token);
    assert.ok(successRes.qrDataUrl);

    // Verify ticket count is exactly 1
    const ticketCount = db.prepare('SELECT COUNT(*) as c FROM tickets').get().c;
    assert.equal(ticketCount, 1);
  });

  await t.test('repeated payment request returns existing ticket without creating duplicates', async () => {
    const repeatRes = await orderService.simulatePayment({
      orderId: orderResult.order.orderId,
      status: 'SUCCESS'
    });

    assert.equal(repeatRes.success, true);
    assert.equal(repeatRes.alreadyPaid, true);

    // Ticket count must remain 1
    const ticketCount = db.prepare('SELECT COUNT(*) as c FROM tickets').get().c;
    assert.equal(ticketCount, 1);
  });
});
