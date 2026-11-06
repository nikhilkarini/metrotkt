/**
 * Pure fare calculation function based on distance slabs (in Indian Rupees - ₹).
 *
 * Slabs:
 * - 0 to less than 2 km: ₹10
 * - 2 to less than 5 km: ₹20
 * - 5 to less than 12 km: ₹30
 * - 12 km or more: ₹40
 *
 * @param {number} distanceKm - Trip distance in kilometers
 * @param {Array<{min_km: number, max_km: number|null, fare_inr: number}>} [fareRules] - Optional custom slabs from SQLite
 * @returns {{ fareInr: number, slab: string, distanceKm: number }}
 */
function calculateFare(distanceKm, fareRules = null) {
  const dist = Number(distanceKm);

  if (typeof dist !== 'number' || isNaN(dist) || dist <= 0) {
    throw new Error('Distance must be a valid positive number greater than 0 km.');
  }

  // If DB rules are provided, check against them
  if (Array.isArray(fareRules) && fareRules.length > 0) {
    for (const rule of fareRules) {
      const min = Number(rule.min_km);
      const max = rule.max_km !== null && rule.max_km !== undefined ? Number(rule.max_km) : null;
      if (dist >= min && (max === null || dist < max)) {
        return {
          fareInr: rule.fare_inr,
          slab: max !== null ? `${min} km to < ${max} km` : `${min}+ km`,
          distanceKm: dist
        };
      }
    }
  }

  // Default hard-coded slabs (exact spec match)
  if (dist < 2) {
    return { fareInr: 10, slab: '0 km to < 2 km', distanceKm: dist };
  } else if (dist < 5) {
    return { fareInr: 20, slab: '2 km to < 5 km', distanceKm: dist };
  } else if (dist < 12) {
    return { fareInr: 30, slab: '5 km to < 12 km', distanceKm: dist };
  } else {
    return { fareInr: 40, slab: '12 km and above', distanceKm: dist };
  }
}

/**
 * Returns the maximum distance allowed for a paid fare amount.
 * Useful for validating intermediate exits.
 *
 * @param {number} paidFare - The fare amount paid (e.g., 10, 20, 30, 40)
 * @returns {number} The maximum distance in km covered by this fare
 */
function getMaxDistanceForFare(paidFare) {
  const fare = Number(paidFare);
  if (fare <= 10) return 2.0;
  if (fare <= 20) return 5.0;
  if (fare <= 30) return 12.0;
  return Infinity;
}

module.exports = {
  calculateFare,
  getMaxDistanceForFare
};
