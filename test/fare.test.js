const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateFare, getMaxDistanceForFare } = require('../src/services/fareService');

test('Fare Calculation - Slab Boundaries', async (t) => {
  await t.test('distances below 2 km cost ₹10', () => {
    assert.equal(calculateFare(0.5).fareInr, 10);
    assert.equal(calculateFare(1.0).fareInr, 10);
    assert.equal(calculateFare(1.99).fareInr, 10);
  });

  await t.test('distances from 2 km to less than 5 km cost ₹20', () => {
    assert.equal(calculateFare(2.0).fareInr, 20);
    assert.equal(calculateFare(3.5).fareInr, 20);
    assert.equal(calculateFare(4.99).fareInr, 20);
  });

  await t.test('distances from 5 km to less than 12 km cost ₹30', () => {
    assert.equal(calculateFare(5.0).fareInr, 30);
    assert.equal(calculateFare(8.2).fareInr, 30);
    assert.equal(calculateFare(11.99).fareInr, 30);
  });

  await t.test('distances 12 km or more cost ₹40', () => {
    assert.equal(calculateFare(12.0).fareInr, 40);
    assert.equal(calculateFare(15.5).fareInr, 40);
    assert.equal(calculateFare(50.0).fareInr, 40);
  });

  await t.test('zero or negative distance is rejected', () => {
    assert.throws(() => calculateFare(0), /Distance must be a valid positive number/);
    assert.throws(() => calculateFare(-3.5), /Distance must be a valid positive number/);
    assert.throws(() => calculateFare(NaN), /Distance must be a valid positive number/);
    assert.throws(() => calculateFare('invalid'), /Distance must be a valid positive number/);
  });

  await t.test('getMaxDistanceForFare boundaries', () => {
    assert.equal(getMaxDistanceForFare(10), 2.0);
    assert.equal(getMaxDistanceForFare(20), 5.0);
    assert.equal(getMaxDistanceForFare(30), 12.0);
    assert.equal(getMaxDistanceForFare(40), Infinity);
  });
});
