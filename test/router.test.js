const test = require('node:test');
const assert = require('node:assert/strict');
const { getDatabase } = require('../src/db/database');
const NetworkService = require('../src/services/networkService');

test('Network Route Search - Dijkstra Algorithm', async (t) => {
  const db = getDatabase(':memory:');
  const network = new NetworkService(db, 5);

  const b1 = network.getStationByCode('B1');
  const b3 = network.getStationByCode('B3');
  const cj = network.getStationByCode('CJ');
  const r1 = network.getStationByCode('R1');
  const r4 = network.getStationByCode('R4');

  await t.test('rejects identical origin and destination', () => {
    assert.throws(() => {
      network.findRoute(b1.id, b1.id, 'fastest');
    }, /cannot be the same station/);
  });

  await t.test('finds direct single-line route (B1 to B3)', () => {
    const route = network.findRoute(b1.id, b3.id, 'fastest');
    assert.equal(route.origin.code, 'B1');
    assert.equal(route.destination.code, 'B3');
    assert.equal(route.transferCount, 0);
    assert.equal(route.transferPenaltyMinutes, 0);
    assert.equal(route.orderedStations.length, 3); // B1, B2, B3
    assert.equal(route.stopCount, 2);
    // B1-B2 (2.5km) + B2-B3 (3.2km) = 5.7km
    assert.equal(route.totalDistanceKm, 5.7);
  });

  await t.test('finds interchange route crossing from Blue to Red line (B1 to R4)', () => {
    const route = network.findRoute(b1.id, r4.id, 'fastest');
    assert.equal(route.origin.code, 'B1');
    assert.equal(route.destination.code, 'R4');
    assert.equal(route.transferCount, 1);
    assert.equal(route.transferPenaltyMinutes, 5);
    // Interchange should be Central Junction (CJ)
    assert.equal(route.interchangeStations.length, 1);
    assert.equal(route.interchangeStations[0].code, 'CJ');
    // Segments: Blue segment, then Red segment
    assert.equal(route.segments.length, 2);
    assert.equal(route.segments[0].lineId, 'BLUE');
    assert.equal(route.segments[1].lineId, 'RED');
  });

  await t.test('rejects closed station in route planning', () => {
    // Close station B2
    db.prepare('UPDATE stations SET is_active = 0 WHERE code = ?').run('B2');
    network.refreshGraph();

    assert.throws(() => {
      network.findRoute(b1.id, b3.id, 'fastest');
    }, /closed|No available metro route/);

    // Reopen B2
    db.prepare('UPDATE stations SET is_active = 1 WHERE code = ?').run('B2');
    network.refreshGraph();
  });
});
