require('dotenv').config();
const express = require('express');
const path = require('path');
const os = require('os');
const { getDatabase } = require('./src/db/database');
const NetworkService = require('./src/services/networkService');
const { calculateFare } = require('./src/services/fareService');
const TokenService = require('./src/services/tokenService');
const OrderService = require('./src/services/orderService');
const ValidationService = require('./src/services/validationService');
const AdminService = require('./src/services/adminService');

function createApp(dbInstance = null) {
  const app = express();
  app.use(express.json());

  // Database and services initialization
  const db = dbInstance || getDatabase();
  const networkService = new NetworkService(db, process.env.TRANSFER_PENALTY_MINUTES || 5);
  const tokenService = new TokenService(process.env.HMAC_SECRET);
  const orderService = new OrderService(db, networkService, tokenService);
  const validationService = new ValidationService(db, networkService, tokenService);
  const adminService = new AdminService(db, networkService);

  // Serve static vendor files (local html5-qrcode library)
  app.use('/vendor', express.static(path.join(__dirname, 'node_modules', 'html5-qrcode')));

  // Serve static frontend assets
  app.use(express.static(path.join(__dirname, 'public')));

  // -------------------------------------------------------------
  // Public Passenger APIs
  // -------------------------------------------------------------

  // 1. List active stations and network metadata
  app.get('/api/v1/stations', (req, res) => {
    try {
      const stations = networkService.getAllStations(true);
      const lines = Array.from(networkService.lines.values());
      res.json({ success: true, stations, lines });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 2. Route & Fare Quote
  app.post('/api/v1/routes/quote', (req, res) => {
    try {
      const { originStationId, destinationStationId, routeMode = 'fastest' } = req.body;
      if (!originStationId || !destinationStationId) {
        return res.status(400).json({
          success: false,
          error: 'Both originStationId and destinationStationId are required.'
        });
      }

      const route = networkService.findRoute(Number(originStationId), Number(destinationStationId), routeMode);
      const fareRules = adminService.getFareRules();
      const fare = calculateFare(route.totalDistanceKm, fareRules);

      res.json({
        success: true,
        route,
        fare
      });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // 3. Create Order (Idempotent)
  app.post('/api/v1/orders', (req, res) => {
    try {
      const { idempotencyKey, originStationId, destinationStationId, routeMode = 'fastest' } = req.body;
      if (!idempotencyKey) {
        return res.status(400).json({
          success: false,
          error: 'An idempotencyKey is required to create an order.'
        });
      }

      const result = orderService.createOrder({
        idempotencyKey,
        originStationId,
        destinationStationId,
        routeMode
      });

      res.status(result.isDuplicate ? 200 : 201).json({
        success: true,
        isDuplicate: result.isDuplicate,
        order: result.order,
        ticket: result.ticket
      });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // 4. Demo Payment Simulation
  app.post('/api/v1/orders/:id/demo-payment', async (req, res) => {
    try {
      const orderId = req.params.id;
      const { status = 'SUCCESS' } = req.body;

      const result = await orderService.simulatePayment({ orderId, status });
      res.json(result);
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // 5. Retrieve Ticket (Guest lookup)
  app.get('/api/v1/tickets/:id', async (req, res) => {
    try {
      const ticketId = req.params.id;
      const guestToken = req.query.token;

      const ticket = orderService.getTicketById(ticketId, guestToken);
      if (!ticket) {
        return res.status(404).json({ success: false, error: 'Ticket not found or access token invalid.' });
      }

      const expSec = Math.floor(new Date(ticket.expiresAt).getTime() / 1000);
      const signedToken = tokenService.createSignedToken(ticket.ticketId, ticket.nonce, expSec);
      const qrDataUrl = await tokenService.generateQrCodeDataUrl(signedToken);

      res.json({
        success: true,
        ticket,
        token: signedToken,
        qrDataUrl
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // -------------------------------------------------------------
  // Gate Simulator Validation APIs
  // -------------------------------------------------------------

  app.post('/api/v1/validation/entry', (req, res) => {
    try {
      const { tokenString, stationId } = req.body;
      if (!tokenString || !stationId) {
        return res.status(400).json({
          success: false,
          error: 'tokenString and stationId are required.'
        });
      }

      const result = validationService.validateEntry({ tokenString, stationId });
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/v1/validation/exit', (req, res) => {
    try {
      const { tokenString, stationId } = req.body;
      if (!tokenString || !stationId) {
        return res.status(400).json({
          success: false,
          error: 'tokenString and stationId are required.'
        });
      }

      const result = validationService.validateExit({ tokenString, stationId });
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/v1/validation/events', (req, res) => {
    try {
      const limit = Number(req.query.limit) || 20;
      const events = validationService.getValidationEvents(limit);
      res.json({ success: true, events });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // -------------------------------------------------------------
  // Admin APIs (Protected by Bearer Session Token)
  // -------------------------------------------------------------

  app.post('/api/v1/admin/login', (req, res) => {
    try {
      const { password } = req.body;
      const result = adminService.login(password);
      if (!result.success) {
        return res.status(401).json(result);
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Admin auth middleware
  const requireAdmin = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !adminService.verifySession(authHeader)) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Admin session required.' });
    }
    next();
  };

  app.get('/api/v1/admin/summary', requireAdmin, (req, res) => {
    try {
      const summary = adminService.getDashboardSummary();
      res.json({ success: true, summary });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/v1/admin/stations', requireAdmin, (req, res) => {
    try {
      const stations = adminService.getAllStations();
      res.json({ success: true, stations });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.patch('/api/v1/admin/stations/:id', requireAdmin, (req, res) => {
    try {
      const stationId = req.params.id;
      const { isActive } = req.body;
      const updated = adminService.toggleStation(stationId, Boolean(isActive));
      res.json({ success: true, station: updated });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  app.get('/api/v1/admin/connections', requireAdmin, (req, res) => {
    try {
      const connections = adminService.getAllConnections();
      res.json({ success: true, connections });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.patch('/api/v1/admin/connections/:id', requireAdmin, (req, res) => {
    try {
      const connectionId = req.params.id;
      const { isActive } = req.body;
      const updated = adminService.toggleConnection(connectionId, Boolean(isActive));
      res.json({ success: true, connection: updated });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  app.get('/api/v1/admin/tickets', requireAdmin, (req, res) => {
    try {
      const limit = Number(req.query.limit) || 30;
      const tickets = adminService.getRecentTickets(limit);
      res.json({ success: true, tickets });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/v1/admin/fare-rules', requireAdmin, (req, res) => {
    try {
      const rules = adminService.getFareRules();
      res.json({ success: true, rules });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/v1/system-info', async (req, res) => {
    try {
      const QRCode = require('qrcode');
      const interfaces = os.networkInterfaces();
      const addresses = [];
      for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
          if (net.family === 'IPv4' && !net.internal) {
            addresses.push(net.address);
          }
        }
      }
      const port = Number(process.env.PORT) || 3000;
      const primaryIp = addresses[0] || 'localhost';
      const mobileUrl = `http://${primaryIp}:${port}`;
      const mobileQrDataUrl = await QRCode.toDataURL(mobileUrl, {
        margin: 2,
        width: 260,
        color: { dark: '#000000', light: '#ffffff' }
      });

      res.json({
        success: true,
        port,
        localIps: addresses,
        primaryIp,
        mobileUrl,
        mobileQrDataUrl
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Fallback to index.html for unknown HTML navigation (compatible with Express 5)
  app.use((req, res, next) => {
    if (req.method === 'GET' && req.accepts('html')) {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
      res.status(404).json({ success: false, error: 'Not Found' });
    }
  });

  return {
    app,
    db,
    networkService,
    tokenService,
    orderService,
    validationService,
    adminService
  };
}

// Start server when run directly
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  const { app } = createApp();
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚇 Metro AFC Ticket Generator is running!`);
    console.log(`📡 Local server URL: http://localhost:${PORT}`);
    console.log(`🔒 HMAC Secret: Configured locally via .env`);
    console.log(`🔑 Admin Password: ${process.env.ADMIN_PASSWORD || 'adminpassword123'}`);
    console.log(`=======================================================`);
  });
}

module.exports = { createApp };
