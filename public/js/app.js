// ==============================================================
// METRO AFC — APPLE ECOSYSTEM CORE APPLICATION CONTROLLER
// Seamless Passenger Workflow, Apple Pay Checkout, Apple Wallet Pass,
// Dynamic Island Toasts, Quick Demo Journeys & Mobile Connection
// ==============================================================

const appState = {
  stations: [],
  lines: [],
  currentQuote: null,
  currentOrder: null,
  currentTicket: null,
  currentSignedToken: null,
  adminToken: sessionStorage.getItem('metro_admin_token') || null,
  systemInfo: null
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  fetchStations();
  fetchSystemInfo();
  loadSavedTicket();
  updateStepper('planner');
  startLiveClock();
});

// ==============================================================
// View Router & Workflow Stepper
// ==============================================================

function switchView(viewName) {
  const views = ['planner', 'checkout', 'ticket', 'gate', 'admin', 'about'];
  views.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    const tab = document.getElementById(`tab-${v}`);
    const mobTab = document.getElementById(`mobtab-${v}`);
    if (el) el.classList.remove('active');
    if (tab) tab.classList.remove('active');
    if (mobTab) mobTab.classList.remove('active');
  });

  const targetView = document.getElementById(`view-${viewName}`);
  const targetTab = document.getElementById(`tab-${viewName}`);
  const targetMobTab = document.getElementById(`mobtab-${viewName}`);
  if (targetView) targetView.classList.add('active');
  if (targetTab) targetTab.classList.add('active');
  if (targetMobTab) targetMobTab.classList.add('active');

  updateStepper(viewName);

  // Scroll to top smoothly
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Trigger view-specific handlers
  if (viewName === 'gate') {
    if (typeof onGateViewOpened === 'function') {
      onGateViewOpened();
    }
  } else if (viewName === 'admin') {
    checkAdminAuth();
  }
}

function updateStepper(activeView) {
  const stepper = document.getElementById('workflow-stepper');
  if (!stepper) return;

  const stepOrder = ['planner', 'route', 'checkout', 'ticket', 'gate'];
  let currentStep = 'planner';

  if (activeView === 'planner') {
    currentStep = appState.currentQuote ? 'route' : 'planner';
  } else if (activeView === 'checkout') {
    currentStep = 'checkout';
  } else if (activeView === 'ticket') {
    currentStep = 'ticket';
  } else if (activeView === 'gate') {
    currentStep = 'gate';
  }

  const activeIdx = stepOrder.indexOf(currentStep);

  stepOrder.forEach((step, idx) => {
    const stepEl = document.getElementById(`step-pill-${step}`);
    if (!stepEl) return;

    stepEl.classList.remove('active', 'completed', 'upcoming');
    if (idx < activeIdx) {
      stepEl.classList.add('completed');
    } else if (idx === activeIdx) {
      stepEl.classList.add('active');
    } else {
      stepEl.classList.add('upcoming');
    }
  });
}

// ==============================================================
// Apple Dynamic Island / HUD Notification Toast
// ==============================================================

let toastTimer = null;

function showToast(message, type = 'info', duration = 4000) {
  const toast = document.getElementById('dynamic-island-toast');
  const toastIcon = document.getElementById('toast-icon');
  const toastMsg = document.getElementById('toast-message');

  if (!toast || !toastMsg) return;

  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }

  // Set icon according to notification type
  let iconHtml = '';
  if (type === 'success') {
    iconHtml = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--apple-green)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
  } else if (type === 'danger' || type === 'error') {
    iconHtml = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--apple-red)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
  } else if (type === 'warning') {
    iconHtml = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--apple-orange)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
  } else {
    iconHtml = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--apple-blue)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
  }

  toastIcon.innerHTML = iconHtml;
  toastMsg.textContent = message;

  toast.className = `dynamic-island-toast show toast-${type}`;

  if (duration > 0) {
    toastTimer = setTimeout(() => {
      toast.className = 'dynamic-island-toast';
    }, duration);
  }
}

// Backward compatible alert wrapper
function showAlert(message, type = 'danger', duration = 5000) {
  showToast(message, type, duration);
}

// ==============================================================
// Live Clock for Apple Wallet Passes
// ==============================================================

function startLiveClock() {
  function updateTime() {
    const clockEl = document.getElementById('pass-live-time');
    if (clockEl) {
      const now = new Date();
      clockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
  }
  updateTime();
  setInterval(updateTime, 1000);
}

// ==============================================================
// System Info & Mobile Device Connection
// ==============================================================

async function fetchSystemInfo() {
  try {
    const res = await fetch('/api/v1/system-info');
    const data = await res.json();
    if (data.success) {
      appState.systemInfo = data;
      renderMobileConnectModal(data);
    }
  } catch (err) {
    console.warn('System info endpoint not available:', err);
  }
}

function openMobileConnectModal() {
  const modal = document.getElementById('mobile-connect-modal');
  if (modal) {
    modal.classList.add('active');
    if (appState.systemInfo) {
      renderMobileConnectModal(appState.systemInfo);
    }
  }
}

function closeMobileConnectModal() {
  const modal = document.getElementById('mobile-connect-modal');
  if (modal) modal.classList.remove('active');
}

function renderMobileConnectModal(info) {
  const qrImg = document.getElementById('mobile-qr-img');
  const urlDisplay = document.getElementById('mobile-url-display');
  const ipList = document.getElementById('mobile-ip-list');

  if (qrImg && info.mobileQrDataUrl) {
    qrImg.src = info.mobileQrDataUrl;
  }
  if (urlDisplay && info.mobileUrl) {
    urlDisplay.textContent = info.mobileUrl;
  }
  if (ipList && info.localIps) {
    ipList.innerHTML = info.localIps.map(ip => `<li><code>http://${ip}:${info.port}</code></li>`).join('');
  }
}

function copyMobileUrl() {
  if (appState.systemInfo?.mobileUrl) {
    navigator.clipboard.writeText(appState.systemInfo.mobileUrl).then(() => {
      showToast('Copied Mobile URL to clipboard!', 'success');
    }).catch(() => {
      showToast('Please copy URL manually.', 'info');
    });
  }
}

// ==============================================================
// Stations & Network Initialization
// ==============================================================

async function fetchStations() {
  try {
    const res = await fetch('/api/v1/stations');
    const data = await res.json();
    if (data.success) {
      appState.stations = data.stations;
      appState.lines = data.lines;
      populateStationDropdowns();
      if (typeof populateGateStations === 'function') {
        populateGateStations();
      }
    } else {
      showToast('Failed to load stations: ' + (data.error || 'Server error'), 'danger');
    }
  } catch (err) {
    showToast('Network error connecting to local AFC server.', 'danger');
  }
}

function populateStationDropdowns() {
  const originSelect = document.getElementById('select-origin');
  const destSelect = document.getElementById('select-destination');
  if (!originSelect || !destSelect) return;

  const currentOrigin = originSelect.value;
  const currentDest = destSelect.value;

  originSelect.innerHTML = '<option value="">-- Choose Origin Station --</option>';
  destSelect.innerHTML = '<option value="">-- Choose Destination Station --</option>';

  appState.stations.forEach(s => {
    const optOrigin = document.createElement('option');
    optOrigin.value = s.id;
    optOrigin.textContent = `${s.name} (${s.code})${s.isInterchange ? ' ⇄ Interchange' : ''}`;
    originSelect.appendChild(optOrigin);

    const optDest = document.createElement('option');
    optDest.value = s.id;
    optDest.textContent = `${s.name} (${s.code})${s.isInterchange ? ' ⇄ Interchange' : ''}`;
    destSelect.appendChild(optDest);
  });

  if (currentOrigin) originSelect.value = currentOrigin;
  if (currentDest) destSelect.value = currentDest;
}

function swapOriginDestination() {
  const originSelect = document.getElementById('select-origin');
  const destSelect = document.getElementById('select-destination');
  const temp = originSelect.value;
  originSelect.value = destSelect.value;
  destSelect.value = temp;

  highlightMapStations();
  if (originSelect.value && destSelect.value) {
    handleCalculateRoute();
  }
}

// Interactive Map Node Selection
function handleMapStationClick(code) {
  const station = appState.stations.find(s => s.code.toUpperCase() === code.toUpperCase());
  if (!station) return;

  const originSelect = document.getElementById('select-origin');
  const destSelect = document.getElementById('select-destination');

  if (!originSelect.value || (originSelect.value && destSelect.value)) {
    originSelect.value = station.id;
    destSelect.value = '';
    showToast(`Origin set to ${station.name} (${station.code}). Select destination next.`, 'info');
  } else if (originSelect.value && !destSelect.value) {
    if (String(originSelect.value) === String(station.id)) {
      showToast('Origin and Destination cannot be the same station.', 'warning');
      return;
    }
    destSelect.value = station.id;
    showToast(`Destination set to ${station.name} (${station.code}). Calculating route...`, 'success');
    handleCalculateRoute();
  }

  highlightMapStations();
}

function highlightMapStations() {
  const originSelect = document.getElementById('select-origin');
  const destSelect = document.getElementById('select-destination');

  const originStation = appState.stations.find(s => String(s.id) === String(originSelect?.value));
  const destStation = appState.stations.find(s => String(s.id) === String(destSelect?.value));

  const routeCodes = new Set();
  if (appState.currentQuote?.route?.segments) {
    appState.currentQuote.route.segments.forEach(seg => {
      seg.stations.forEach(st => routeCodes.add(st.code));
    });
  }

  document.querySelectorAll('.map-node').forEach(node => {
    node.classList.remove('selected', 'selected-origin', 'selected-dest', 'in-route');
    const code = node.getAttribute('data-code');
    if (originStation && originStation.code === code) {
      node.classList.add('selected', 'selected-origin');
    } else if (destStation && destStation.code === code) {
      node.classList.add('selected', 'selected-dest');
    } else if (routeCodes.has(code)) {
      node.classList.add('in-route');
    }
  });
}

// Quick Demo Journey Pre-sets
function loadQuickJourney(originCode, destCode, mode = 'fastest') {
  const origin = appState.stations.find(s => s.code === originCode);
  const dest = appState.stations.find(s => s.code === destCode);
  if (!origin || !dest) return;

  const originSelect = document.getElementById('select-origin');
  const destSelect = document.getElementById('select-destination');
  if (originSelect) originSelect.value = origin.id;
  if (destSelect) destSelect.value = dest.id;

  const modeRadio = document.querySelector(`input[name="routeMode"][value="${mode}"]`);
  if (modeRadio) modeRadio.checked = true;

  highlightMapStations();
  handleCalculateRoute();

  // Scroll down smoothly to route result
  setTimeout(() => {
    const quoteContainer = document.getElementById('quote-container');
    if (quoteContainer) {
      quoteContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 250);
}

// ==============================================================
// Route & Fare Calculation Flow
// ==============================================================

async function handleCalculateRoute(event) {
  if (event) event.preventDefault();

  const originId = document.getElementById('select-origin')?.value;
  const destinationId = document.getElementById('select-destination')?.value;
  const mode = document.querySelector('input[name="routeMode"]:checked')?.value || 'fastest';

  if (!originId || !destinationId) {
    showToast('Please select both Origin and Destination stations.', 'warning');
    return;
  }

  if (originId === destinationId) {
    showToast('Origin and Destination cannot be the same station.', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/v1/routes/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        originStationId: originId,
        destinationStationId: destinationId,
        routeMode: mode
      })
    });

    const data = await res.json();
    if (!data.success) {
      showToast(data.error || 'Failed to calculate route.', 'danger');
      return;
    }

    appState.currentQuote = data;
    renderQuoteResults(data);
    updateStepper('planner');
  } catch (err) {
    showToast('Error calculating route: ' + err.message, 'danger');
  }
}

function renderQuoteResults(data) {
  const { route, fare } = data;

  const quotePlaceholder = document.getElementById('quote-placeholder');
  const quoteContainer = document.getElementById('quote-container');

  if (quotePlaceholder) quotePlaceholder.style.display = 'none';
  if (quoteContainer) quoteContainer.style.display = 'block';

  document.getElementById('quote-fare').textContent = `₹${fare.fareInr}`;
  document.getElementById('btn-checkout-fare').textContent = fare.fareInr;
  document.getElementById('quote-slab-label').textContent = fare.slab;
  document.getElementById('quote-time').textContent = `${route.totalMinutes}m`;
  document.getElementById('quote-distance').textContent = `${route.totalDistanceKm} km`;
  document.getElementById('quote-stops').textContent = route.stopCount;
  document.getElementById('quote-transfers').textContent = route.transferCount;
  document.getElementById('quote-route-mode-badge').textContent =
    route.routeMode === 'fastest' ? '⚡ Fastest Route' : '🔄 Fewest Transfers';

  // Render Timeline
  const timeline = document.getElementById('quote-timeline');
  timeline.innerHTML = '';

  route.segments.forEach((seg, idx) => {
    const segCard = document.createElement('div');
    segCard.className = 'route-segment-card';
    const isRedLine = seg.lineId === 'RED';
    const lineColor = isRedLine ? 'var(--apple-red)' : 'var(--apple-blue)';

    const segHeader = document.createElement('div');
    segHeader.className = 'segment-header';
    segHeader.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="line-pill-badge ${isRedLine ? 'red' : 'blue'}"></span>
        <span style="font-weight:700; color:#fff;">${seg.lineName}</span>
      </div>
      <span style="color:var(--text-secondary); font-size:0.85rem; font-weight:500;">
        ${seg.distanceKm} km • ${seg.travelMinutes} mins
      </span>
    `;
    segCard.appendChild(segHeader);

    const stationList = document.createElement('ul');
    stationList.className = 'segment-stations';

    seg.stations.forEach((st, sIdx) => {
      const li = document.createElement('li');
      li.className = 'timeline-station';

      const isFirstOfAll = idx === 0 && sIdx === 0;
      const isLastOfAll = idx === route.segments.length - 1 && sIdx === seg.stations.length - 1;

      if (isFirstOfAll) li.classList.add('origin');
      else if (isLastOfAll) li.classList.add('destination');

      li.innerHTML = `
        <span class="station-dot" style="background:${lineColor};"></span>
        <span class="station-name" style="font-weight:${isFirstOfAll || isLastOfAll ? '700' : '500'};">
          ${st.name} <small style="color:var(--text-tertiary); font-family:var(--font-mono);">(${st.code})</small>
        </span>
      `;
      stationList.appendChild(li);
    });

    segCard.appendChild(stationList);
    timeline.appendChild(segCard);

    // Interchange transition card
    if (idx < route.segments.length - 1) {
      const interchange = route.interchangeStations[idx];
      const interDiv = document.createElement('div');
      interDiv.className = 'interchange-transfer-card';
      interDiv.innerHTML = `
        <div class="interchange-icon">⇄</div>
        <div>
          <div style="font-weight:600; color:#fff;">Transfer at ${interchange ? interchange.name : 'Central Junction'}</div>
          <div style="font-size:0.8rem; color:var(--text-secondary);">Switch between Blue and Red platforms (+5 mins transfer penalty applied)</div>
        </div>
      `;
      timeline.appendChild(interDiv);
    }
  });

  highlightMapStations();
}

// ==============================================================
// Apple Pay Checkout Flow
// ==============================================================

function startCheckoutFromQuote() {
  if (!appState.currentQuote) return;

  const { route, fare } = appState.currentQuote;

  document.getElementById('checkout-journey-title').textContent = `${route.origin.name} ➔ ${route.destination.name}`;
  document.getElementById('checkout-details-line').textContent =
    `${route.stopCount} stops • ${route.totalMinutes} mins • ${route.totalDistanceKm} km`;
  document.getElementById('checkout-slab-badge').textContent = fare.slab;
  document.getElementById('checkout-base-fare').textContent = `₹${fare.fareInr}`;
  document.getElementById('checkout-total-fare').textContent = `₹${fare.fareInr}`;

  switchView('checkout');
}

async function handleSimulatePayment(simStatus) {
  if (!appState.currentQuote) {
    showToast('Please calculate a route first.', 'warning');
    switchView('planner');
    return;
  }

  const { route } = appState.currentQuote;

  // Visual pulse on Apple Pay button
  const payBtn = document.getElementById('apple-pay-btn');
  if (payBtn) payBtn.classList.add('paying');

  showToast('Authenticating with Apple Pay...', 'info', 2000);

  // Generate an idempotency key for this order session if not already generated
  if (!appState.currentOrder) {
    const idempotencyKey = 'idemp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    try {
      const orderRes = await fetch('/api/v1/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey,
          originStationId: route.origin.id,
          destinationStationId: route.destination.id,
          routeMode: route.routeMode
        })
      });

      const orderData = await orderRes.json();
      if (!orderData.success) {
        if (payBtn) payBtn.classList.remove('paying');
        showToast('Failed to create order: ' + (orderData.error || 'Server error'), 'danger');
        return;
      }
      appState.currentOrder = orderData.order;
    } catch (err) {
      if (payBtn) payBtn.classList.remove('paying');
      showToast('Network error while creating order.', 'danger');
      return;
    }
  }

  // Execute payment simulation
  try {
    const payRes = await fetch(`/api/v1/orders/${appState.currentOrder.orderId}/demo-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: simStatus })
    });

    const payData = await payRes.json();
    if (payBtn) payBtn.classList.remove('paying');

    if (!payData.success) {
      showToast(`Payment Declined: ${payData.message || 'Simulation test failed'}. You can retry anytime.`, 'danger', 5000);
      return;
    }

    // Success! Save to global state & localStorage
    appState.currentTicket = payData.ticket;
    appState.currentSignedToken = payData.token;
    saveTicketToStorage(payData);

    renderTicket(payData);
    showToast('Payment successful! Your Apple Wallet Transit Pass is ready.', 'success', 4000);
    switchView('ticket');
  } catch (err) {
    if (payBtn) payBtn.classList.remove('paying');
    showToast('Error processing payment: ' + err.message, 'danger');
  }
}

// ==============================================================
// Apple Wallet Transit Pass Rendering
// ==============================================================

function renderTicket(data) {
  const { ticket, qrDataUrl } = data;

  document.getElementById('ticket-id-display').textContent = ticket.ticketId;
  document.getElementById('ticket-origin-code').textContent = ticket.route?.origin?.code || 'ORIGIN';
  document.getElementById('ticket-origin-name').textContent = ticket.route?.origin?.name || 'Origin Station';
  document.getElementById('ticket-dest-code').textContent = ticket.route?.destination?.code || 'DEST';
  document.getElementById('ticket-destination-name').textContent = ticket.route?.destination?.name || 'Destination Station';
  document.getElementById('ticket-fare-display').textContent = `₹${ticket.fareAmount}`;
  document.getElementById('ticket-stops-display').textContent = `${ticket.route?.stopCount || 1} Stops`;
  document.getElementById('ticket-duration-display').textContent = `${ticket.route?.totalMinutes || 10} Mins`;

  const qrImg = document.getElementById('ticket-qr-img');
  if (qrImg) qrImg.src = qrDataUrl;

  const badge = document.getElementById('ticket-badge');
  if (badge) {
    badge.textContent = ticket.status;
    badge.className = `ticket-status-badge status-${ticket.status.toLowerCase()}`;
  }

  const expDate = new Date(ticket.expiresAt);
  const expiryEl = document.getElementById('ticket-expiry-display');
  if (expiryEl) {
    expiryEl.textContent = expDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const issuedDate = new Date(ticket.issuedAt);
  const issuedEl = document.getElementById('ticket-issued-display');
  if (issuedEl) {
    issuedEl.textContent = issuedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

function saveTicketToStorage(data) {
  try {
    localStorage.setItem('metro_last_ticket', JSON.stringify(data));
  } catch (e) {}
}

function loadSavedTicket() {
  try {
    const saved = localStorage.getItem('metro_last_ticket');
    if (saved) {
      const data = JSON.parse(saved);
      appState.currentTicket = data.ticket;
      appState.currentSignedToken = data.token;
      renderTicket(data);
    }
  } catch (e) {}
}

function copyTicketToken() {
  if (!appState.currentSignedToken) {
    showToast('No active ticket token to copy.', 'warning');
    return;
  }
  navigator.clipboard.writeText(appState.currentSignedToken).then(() => {
    showToast('Copied signed QR token string to clipboard!', 'success');
  }).catch(() => {
    showToast('Could not access clipboard. Please copy manually.', 'info');
  });
}

function sendTicketToGateSimulator() {
  if (!appState.currentSignedToken) {
    showToast('No active ticket available.', 'warning');
    return;
  }

  switchView('gate');

  const tokenInput = document.getElementById('manual-token-input');
  if (tokenInput) {
    tokenInput.value = appState.currentSignedToken;
  }

  // Pre-configure turnstile mode and station based on ticket state
  if (appState.currentTicket) {
    const gateSelect = document.getElementById('gate-station-select');
    if (appState.currentTicket.status === 'IN_TRIP') {
      setGateMode('EXIT');
      if (gateSelect) gateSelect.value = appState.currentTicket.destinationStationId;
    } else {
      setGateMode('ENTRY');
      if (gateSelect) gateSelect.value = appState.currentTicket.originStationId;
    }
    if (typeof handleGateStationChange === 'function') {
      handleGateStationChange();
    }
    if (typeof checkTicketGateGuidance === 'function') {
      checkTicketGateGuidance();
    }
  }

  showToast('Turnstile automatically configured for your ticket!', 'success');
}

function printTicketPass() {
  window.print();
}

// ==============================================================
// Admin Console Flow
// ==============================================================

function checkAdminAuth() {
  const token = sessionStorage.getItem('metro_admin_token');
  if (token) {
    document.getElementById('admin-login-box').style.display = 'none';
    document.getElementById('admin-dashboard-box').style.display = 'block';
    loadAdminDashboard();
  } else {
    document.getElementById('admin-login-box').style.display = 'block';
    document.getElementById('admin-dashboard-box').style.display = 'none';
  }
}

async function handleAdminLogin(event) {
  event.preventDefault();
  const password = document.getElementById('admin-password-input').value;

  try {
    const res = await fetch('/api/v1/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });

    const data = await res.json();
    if (!data.success) {
      showToast(data.reason || 'Invalid admin credentials.', 'danger');
      return;
    }

    sessionStorage.setItem('metro_admin_token', data.token);
    appState.adminToken = data.token;
    checkAdminAuth();
    showToast('Authenticated into Admin Dashboard.', 'success');
  } catch (err) {
    showToast('Error logging in: ' + err.message, 'danger');
  }
}

function handleAdminLogout() {
  sessionStorage.removeItem('metro_admin_token');
  appState.adminToken = null;
  checkAdminAuth();
  showToast('Signed out from Admin Dashboard.', 'info');
}

async function loadAdminDashboard() {
  const token = sessionStorage.getItem('metro_admin_token');
  if (!token) return;

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  try {
    // 1. Summary
    const summaryRes = await fetch('/api/v1/admin/summary', { headers: authHeaders });
    const summaryData = await summaryRes.json();
    if (summaryData.success) {
      const s = summaryData.summary;
      document.getElementById('admin-stat-stations').textContent = `${s.stations.active}/${s.stations.total}`;
      document.getElementById('admin-stat-connections').textContent = `${s.connections.active}/${s.connections.total}`;
      document.getElementById('admin-stat-orders').textContent = s.orders.total;
      document.getElementById('admin-stat-tickets').textContent = s.tickets.paid;
      document.getElementById('admin-stat-validations').textContent = s.validations.total;
    }

    // 2. Stations
    const stationsRes = await fetch('/api/v1/admin/stations', { headers: authHeaders });
    const stationsData = await stationsRes.json();
    if (stationsData.success) {
      renderAdminStations(stationsData.stations);
    }

    // 3. Fares
    const faresRes = await fetch('/api/v1/admin/fare-rules', { headers: authHeaders });
    const faresData = await faresRes.json();
    if (faresData.success) {
      renderAdminFares(faresData.rules);
    }

    // 4. Tickets
    const ticketsRes = await fetch('/api/v1/admin/tickets', { headers: authHeaders });
    const ticketsData = await ticketsRes.json();
    if (ticketsData.success) {
      renderAdminTickets(ticketsData.tickets);
    }
  } catch (err) {
    console.warn('Failed loading admin dashboard data:', err);
  }
}

function renderAdminStations(stations) {
  const tbody = document.getElementById('admin-stations-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  stations.forEach(st => {
    const tr = document.createElement('tr');
    const isInter = st.is_interchange === 1;
    const typeLabel = isInter
      ? '<span class="apple-badge badge-purple">INTERCHANGE</span>'
      : '<span class="apple-badge badge-gray">STANDARD</span>';

    const statusBadge = st.is_active === 1
      ? '<span class="apple-badge badge-green">ACTIVE</span>'
      : '<span class="apple-badge badge-red">CLOSED</span>';

    const toggleBtnLabel = st.is_active === 1 ? 'Close Station' : 'Activate';
    const toggleBtnClass = st.is_active === 1 ? 'btn-secondary' : 'btn-success';

    tr.innerHTML = `
      <td><code style="font-weight:700;">${st.code}</code></td>
      <td><strong>${st.name}</strong></td>
      <td>${st.line_code}</td>
      <td>${typeLabel}</td>
      <td>${statusBadge}</td>
      <td>
        <button type="button" class="btn btn-sm ${toggleBtnClass}" onclick="handleToggleStation(${st.id}, ${st.is_active === 1 ? 0 : 1})">
          ${toggleBtnLabel}
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function handleToggleStation(stationId, newActiveState) {
  const token = sessionStorage.getItem('metro_admin_token');
  try {
    const res = await fetch(`/api/v1/admin/stations/${stationId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ isActive: Boolean(newActiveState) })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Station status updated. Graph cache rebuilt!`, 'success');
      loadAdminDashboard();
      fetchStations();
    } else {
      showToast(data.error || 'Failed to update station state.', 'danger');
    }
  } catch (err) {
    showToast('Network error updating station.', 'danger');
  }
}

function renderAdminFares(rules) {
  const tbody = document.getElementById('admin-fares-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  rules.forEach(r => {
    const tr = document.createElement('tr');
    const maxLabel = r.max_km >= 999 ? '∞ (Above 12 km)' : `< ${r.max_km} km`;
    tr.innerHTML = `
      <td>${r.min_km} km</td>
      <td>${maxLabel}</td>
      <td style="font-weight:700; color:var(--apple-green);">₹${r.fare_inr}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderAdminTickets(tickets) {
  const tbody = document.getElementById('admin-tickets-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!tickets || tickets.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-tertiary);">No tickets issued yet.</td></tr>';
    return;
  }

  tickets.forEach(t => {
    const tr = document.createElement('tr');
    const statusBadge = t.status === 'ACTIVE'
      ? '<span class="apple-badge badge-green">ACTIVE</span>'
      : (t.status === 'IN_TRIP'
        ? '<span class="apple-badge badge-orange">IN TRIP</span>'
        : '<span class="apple-badge badge-gray">' + t.status + '</span>');

    tr.innerHTML = `
      <td><code style="font-size:0.8rem;">${t.ticket_id}</code></td>
      <td>${t.origin_name || 'Station #' + t.origin_station_id} ➔ ${t.dest_name || 'Station #' + t.destination_station_id}</td>
      <td style="font-weight:700; color:var(--apple-green);">₹${t.fare_amount}</td>
      <td>${statusBadge}</td>
    `;
    tbody.appendChild(tr);
  });
}
