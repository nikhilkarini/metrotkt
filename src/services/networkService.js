class NetworkService {
  constructor(db, transferPenaltyMinutes = 5) {
    this.db = db;
    this.transferPenaltyMinutes = Number(transferPenaltyMinutes) || 5;
    this.stations = new Map();
    this.lines = new Map();
    this.adjacency = new Map(); // stationId -> Array of edges
    this.loadGraph();
  }

  loadGraph() {
    this.stations.clear();
    this.lines.clear();
    this.adjacency.clear();

    const linesRows = this.db.prepare('SELECT * FROM lines').all();
    for (const l of linesRows) {
      this.lines.set(l.id, l);
    }

    const stationsRows = this.db.prepare('SELECT * FROM stations').all();
    for (const s of stationsRows) {
      this.stations.set(s.id, {
        id: s.id,
        code: s.code,
        name: s.name,
        lineCode: s.line_code,
        isInterchange: Boolean(s.is_interchange),
        isActive: Boolean(s.is_active),
        displayOrder: s.display_order
      });
      this.adjacency.set(s.id, []);
    }

    // Load active connections between active stations
    const connectionsRows = this.db.prepare(`
      SELECT c.*, s1.is_active as from_active, s2.is_active as to_active
      FROM connections c
      JOIN stations s1 ON c.from_station_id = s1.id
      JOIN stations s2 ON c.to_station_id = s2.id
      WHERE c.is_active = 1 AND s1.is_active = 1 AND s2.is_active = 1
    `).all();

    for (const c of connectionsRows) {
      const edges = this.adjacency.get(c.from_station_id);
      if (edges) {
        edges.push({
          connectionId: c.id,
          toStationId: c.to_station_id,
          lineId: c.line_id,
          distanceKm: Number(c.distance_km),
          travelMinutes: Number(c.travel_minutes)
        });
      }
    }
  }

  refreshGraph() {
    this.loadGraph();
  }

  getAllStations(onlyActive = true) {
    const list = Array.from(this.stations.values());
    if (onlyActive) {
      return list.filter(s => s.isActive);
    }
    return list;
  }

  getStationById(id) {
    return this.stations.get(Number(id));
  }

  getStationByCode(code) {
    for (const s of this.stations.values()) {
      if (s.code.toUpperCase() === String(code).trim().toUpperCase()) {
        return s;
      }
    }
    return null;
  }

  findRoute(originId, destinationId, mode = 'fastest') {
    const origin = this.getStationById(originId);
    const destination = this.getStationById(destinationId);

    if (!origin) {
      throw new Error(`Origin station ID ${originId} not found.`);
    }
    if (!destination) {
      throw new Error(`Destination station ID ${destinationId} not found.`);
    }
    if (!origin.isActive) {
      throw new Error(`Origin station '${origin.name}' is currently closed.`);
    }
    if (!destination.isActive) {
      throw new Error(`Destination station '${destination.name}' is currently closed.`);
    }
    if (origin.id === destination.id) {
      throw new Error('Origin and destination cannot be the same station.');
    }

    // Dijkstra state: (stationId, lineId)
    // Priority depends on mode:
    // 'fastest': primary = effectiveMinutes, secondary = transferCount, tertiary = travelMinutes
    // 'fewest-interchanges': primary = transferCount, secondary = travelMinutes, tertiary = effectiveMinutes

    const makeKey = (stationId, lineId) => `${stationId}:${lineId || 'NONE'}`;

    // Priority Queue using a simple sorted array (sufficient and fast for metro graph size)
    const queue = [];
    const bestCost = new Map(); // key -> { effectiveMinutes, transferCount, travelMinutes, distanceKm }
    const cameFrom = new Map(); // key -> { prevKey, edge, stationId, lineId }

    const initialKey = makeKey(origin.id, null);
    bestCost.set(initialKey, {
      effectiveMinutes: 0,
      transferCount: 0,
      travelMinutes: 0,
      distanceKm: 0
    });

    queue.push({
      key: initialKey,
      stationId: origin.id,
      lineId: null,
      effectiveMinutes: 0,
      transferCount: 0,
      travelMinutes: 0,
      distanceKm: 0
    });

    const isBetter = (a, b) => {
      if (mode === 'fewest-interchanges') {
        if (a.transferCount !== b.transferCount) {
          return a.transferCount < b.transferCount;
        }
        if (Math.abs(a.travelMinutes - b.travelMinutes) > 0.001) {
          return a.travelMinutes < b.travelMinutes;
        }
        return a.distanceKm < b.distanceKm;
      } else {
        // 'fastest'
        if (Math.abs(a.effectiveMinutes - b.effectiveMinutes) > 0.001) {
          return a.effectiveMinutes < b.effectiveMinutes;
        }
        if (a.transferCount !== b.transferCount) {
          return a.transferCount < b.transferCount;
        }
        return a.distanceKm < b.distanceKm;
      }
    };

    let destinationBestState = null;

    while (queue.length > 0) {
      // Find min state
      let minIdx = 0;
      for (let i = 1; i < queue.length; i++) {
        if (isBetter(queue[i], queue[minIdx])) {
          minIdx = i;
        }
      }
      const current = queue.splice(minIdx, 1)[0];

      if (current.stationId === destination.id) {
        if (!destinationBestState || isBetter(current, destinationBestState)) {
          destinationBestState = current;
          // In Dijkstra with strictly positive edge costs, once destination is popped it is optimal
          break;
        }
      }

      const recordedBest = bestCost.get(current.key);
      if (recordedBest && isBetter(recordedBest, current)) {
        // Already found a strictly better path to this state
        continue;
      }

      const edges = this.adjacency.get(current.stationId) || [];
      for (const edge of edges) {
        const nextStation = this.stations.get(edge.toStationId);
        if (!nextStation || !nextStation.isActive) {
          continue;
        }

        const isTransfer = current.lineId !== null && current.lineId !== edge.lineId;
        const addTransfers = isTransfer ? 1 : 0;
        const addPenalty = isTransfer ? this.transferPenaltyMinutes : 0;

        const nextTransferCount = current.transferCount + addTransfers;
        const nextTravelMinutes = current.travelMinutes + edge.travelMinutes;
        const nextEffectiveMinutes = current.effectiveMinutes + edge.travelMinutes + addPenalty;
        const nextDistanceKm = current.distanceKm + edge.distanceKm;

        const nextKey = makeKey(edge.toStationId, edge.lineId);
        const nextCost = {
          effectiveMinutes: nextEffectiveMinutes,
          transferCount: nextTransferCount,
          travelMinutes: nextTravelMinutes,
          distanceKm: nextDistanceKm
        };

        const existingBest = bestCost.get(nextKey);
        if (!existingBest || isBetter(nextCost, existingBest)) {
          bestCost.set(nextKey, nextCost);
          cameFrom.set(nextKey, {
            prevKey: current.key,
            edge: edge,
            fromStationId: current.stationId,
            toStationId: edge.toStationId,
            lineId: edge.lineId,
            isTransfer
          });
          queue.push({
            key: nextKey,
            stationId: edge.toStationId,
            lineId: edge.lineId,
            ...nextCost
          });
        }
      }
    }

    if (!destinationBestState) {
      throw new Error(`No available metro route found between '${origin.name}' and '${destination.name}'.`);
    }

    // Reconstruct path
    const pathEdges = [];
    let currKey = destinationBestState.key;

    while (currKey && cameFrom.has(currKey)) {
      const step = cameFrom.get(currKey);
      pathEdges.unshift(step);
      currKey = step.prevKey;
    }

    const orderedStationIds = [origin.id];
    for (const step of pathEdges) {
      orderedStationIds.push(step.toStationId);
    }

    const orderedStations = orderedStationIds.map(id => {
      const st = this.stations.get(id);
      return {
        id: st.id,
        code: st.code,
        name: st.name,
        lineCode: st.lineCode,
        isInterchange: st.isInterchange
      };
    });

    // Group into line segments
    const segments = [];
    const interchangeStations = [];
    let currentSegment = null;

    for (let i = 0; i < pathEdges.length; i++) {
      const step = pathEdges[i];
      const fromSt = this.stations.get(step.fromStationId);
      const toSt = this.stations.get(step.toStationId);
      const lineObj = this.lines.get(step.lineId) || { id: step.lineId, name: step.lineId, color: '#666' };

      if (!currentSegment || currentSegment.lineId !== step.lineId) {
        if (currentSegment) {
          // Line changed at fromSt!
          interchangeStations.push({
            id: fromSt.id,
            code: fromSt.code,
            name: fromSt.name
          });
        }
        currentSegment = {
          lineId: step.lineId,
          lineName: lineObj.name,
          lineColor: lineObj.color,
          fromStation: { id: fromSt.id, code: fromSt.code, name: fromSt.name },
          toStation: { id: toSt.id, code: toSt.code, name: toSt.name },
          distanceKm: step.edge.distanceKm,
          travelMinutes: step.edge.travelMinutes,
          stations: [
            { id: fromSt.id, code: fromSt.code, name: fromSt.name },
            { id: toSt.id, code: toSt.code, name: toSt.name }
          ]
        };
        segments.push(currentSegment);
      } else {
        currentSegment.toStation = { id: toSt.id, code: toSt.code, name: toSt.name };
        currentSegment.distanceKm = Number((currentSegment.distanceKm + step.edge.distanceKm).toFixed(2));
        currentSegment.travelMinutes = Number((currentSegment.travelMinutes + step.edge.travelMinutes).toFixed(1));
        currentSegment.stations.push({ id: toSt.id, code: toSt.code, name: toSt.name });
      }
    }

    return {
      origin: { id: origin.id, code: origin.code, name: origin.name },
      destination: { id: destination.id, code: destination.code, name: destination.name },
      routeMode: mode,
      orderedStations,
      segments,
      stopCount: orderedStations.length - 1,
      interchangeStations,
      pureTravelMinutes: Number(destinationBestState.travelMinutes.toFixed(1)),
      transferPenaltyMinutes: destinationBestState.transferCount * this.transferPenaltyMinutes,
      totalMinutes: Number(destinationBestState.effectiveMinutes.toFixed(1)),
      transferCount: destinationBestState.transferCount,
      totalDistanceKm: Number(destinationBestState.distanceKm.toFixed(2))
    };
  }
}

module.exports = NetworkService;
