// ==============================================================
// METRO AFC — APPLE ECOSYSTEM TURNSTILE GATE CONTROLLER
// Seamless Mobile Camera Scanning, Live Stream, Photo Capture,
// Audio/Haptic Feedback & In-Trip Guided Workflow
// ==============================================================

let currentGateMode = 'ENTRY'; // 'ENTRY' or 'EXIT'
let html5QrScanner = null;
let isScannerRunning = false;
let availableCameras = [];
let currentCameraId = null;
let isTorchOn = false;

// Initialize on Gate view opened
function onGateViewOpened() {
  populateGateStations();
  loadValidationEvents();
  checkTicketGateGuidance();
}

// Populate station options
function populateGateStations() {
  const gateSelect = document.getElementById('gate-station-select');
  if (!gateSelect || !appState.stations) return;

  const currentVal = gateSelect.value;
  gateSelect.innerHTML = '';

  appState.stations.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.name} (${s.code})${s.isInterchange ? ' ⇄ Interchange' : ''}`;
    gateSelect.appendChild(opt);
  });

  if (currentVal) {
    gateSelect.value = currentVal;
  }
}

// Mode toggle: ENTRY vs EXIT
function setGateMode(mode) {
  currentGateMode = mode;
  const btnEntry = document.getElementById('gate-btn-entry');
  const btnExit = document.getElementById('gate-btn-exit');
  const modeLabel = document.getElementById('turnstile-mode-label');

  if (mode === 'ENTRY') {
    if (btnEntry) btnEntry.classList.add('active');
    if (btnExit) btnExit.classList.remove('active');
    if (modeLabel) modeLabel.textContent = 'ENTRY TURNSTILE';
  } else {
    if (btnExit) btnExit.classList.add('active');
    if (btnEntry) btnEntry.classList.remove('active');
    if (modeLabel) modeLabel.textContent = 'EXIT TURNSTILE';
  }

  resetTurnstileIndicator();
}

function handleGateStationChange() {
  resetTurnstileIndicator();
}

// Check ticket state and guide passenger
function checkTicketGateGuidance() {
  const guidanceBanner = document.getElementById('gate-guidance-banner');
  if (!guidanceBanner) return;

  if (!appState.currentTicket) {
    guidanceBanner.style.display = 'none';
    return;
  }

  const t = appState.currentTicket;
  if (t.status === 'ACTIVE') {
    guidanceBanner.style.display = 'flex';
    guidanceBanner.className = 'gate-guide-banner guide-entry';
    guidanceBanner.innerHTML = `
      <div class="guide-icon">🎫</div>
      <div class="guide-content">
        <div class="guide-title">Ticket Ready for Entry</div>
        <div class="guide-desc">Boarding at <strong>${t.route?.origin?.name || 'Origin'}</strong>. Present your QR code to the turnstile below.</div>
      </div>
      <button type="button" class="btn btn-sm btn-primary" onclick="prepareForEntry()">Setup Entry Gate</button>
    `;
  } else if (t.status === 'IN_TRIP') {
    guidanceBanner.style.display = 'flex';
    guidanceBanner.className = 'gate-guide-banner guide-in-trip';
    guidanceBanner.innerHTML = `
      <div class="guide-icon">🚇</div>
      <div class="guide-content">
        <div class="guide-title">Passenger In-Trip</div>
        <div class="guide-desc">Traveling to <strong>${t.route?.destination?.name || 'Destination'}</strong>. Ready to exit the station?</div>
      </div>
      <button type="button" class="btn btn-sm btn-success" onclick="prepareForExit()">Setup Exit Gate</button>
    `;
  } else if (t.status === 'USED') {
    guidanceBanner.style.display = 'flex';
    guidanceBanner.className = 'gate-guide-banner guide-completed';
    guidanceBanner.innerHTML = `
      <div class="guide-icon">✅</div>
      <div class="guide-content">
        <div class="guide-title">Journey Completed</div>
        <div class="guide-desc">Ticket <strong>${t.ticketId}</strong> has been successfully validated for exit. Hope you had a great ride!</div>
      </div>
      <button type="button" class="btn btn-sm btn-secondary" onclick="switchView('planner')">Plan New Trip</button>
    `;
  } else {
    guidanceBanner.style.display = 'none';
  }
}

function prepareForEntry() {
  setGateMode('ENTRY');
  if (appState.currentTicket) {
    const gateSelect = document.getElementById('gate-station-select');
    if (gateSelect) gateSelect.value = appState.currentTicket.originStationId;
    if (appState.currentSignedToken) {
      const tokenInput = document.getElementById('manual-token-input');
      if (tokenInput) tokenInput.value = appState.currentSignedToken;
    }
  }
  resetTurnstileIndicator();
  showToast('Gate set to Entry at Origin station.', 'info');
}

function prepareForExit() {
  setGateMode('EXIT');
  if (appState.currentTicket) {
    const gateSelect = document.getElementById('gate-station-select');
    if (gateSelect) gateSelect.value = appState.currentTicket.destinationStationId;
    if (appState.currentSignedToken) {
      const tokenInput = document.getElementById('manual-token-input');
      if (tokenInput) tokenInput.value = appState.currentSignedToken;
    }
  }
  resetTurnstileIndicator();
  showToast('Gate set to Exit at Destination station.', 'info');
}

function resetTurnstileIndicator() {
  const box = document.getElementById('turnstile-box');
  const indicator = document.getElementById('turnstile-indicator');
  const icon = document.getElementById('turnstile-icon');
  const statusText = document.getElementById('turnstile-status-text');
  const subtext = document.getElementById('turnstile-subtext');

  if (box) box.classList.remove('gate-granted', 'gate-rejected');
  if (indicator) indicator.className = 'turnstile-indicator ready';
  if (icon) icon.innerHTML = `<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
  if (statusText) statusText.textContent = `Gate Closed • Ready for ${currentGateMode} Scan`;
  if (subtext) subtext.textContent = 'Scan QR pass with mobile camera or paste signed token string below';
}

function showTurnstileResult(success, message, subDetail = '') {
  const box = document.getElementById('turnstile-box');
  const indicator = document.getElementById('turnstile-indicator');
  const icon = document.getElementById('turnstile-icon');
  const statusText = document.getElementById('turnstile-status-text');
  const subtext = document.getElementById('turnstile-subtext');

  if (box) box.classList.remove('gate-granted', 'gate-rejected');

  if (success) {
    playSuccessChime();
    if (box) box.classList.add('gate-granted');
    if (indicator) indicator.className = 'turnstile-indicator granted';
    if (icon) icon.innerHTML = `<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    if (statusText) statusText.textContent = `ACCESS GRANTED • TURNSTILE UNLOCKED`;
    if (subtext) subtext.textContent = `${message} ${subDetail}`;

    // Update ticket state if current ticket matches
    if (appState.currentTicket) {
      if (currentGateMode === 'ENTRY') {
        appState.currentTicket.status = 'IN_TRIP';
        updateTicketBadge();
        showToast('Access Granted! You are now in-transit.', 'success');
        updateStepper('gate');
      } else {
        appState.currentTicket.status = 'USED';
        updateTicketBadge();
        showToast('Access Granted! Journey completed.', 'success');
        updateStepper('gate');
      }
      checkTicketGateGuidance();
    }
  } else {
    playErrorBuzz();
    if (box) box.classList.add('gate-rejected');
    if (indicator) indicator.className = 'turnstile-indicator rejected';
    if (icon) icon.innerHTML = `<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    if (statusText) statusText.textContent = `ACCESS DENIED • GATE LOCKED`;
    if (subtext) subtext.textContent = message;
    showToast(message, 'danger');
  }

  loadValidationEvents();
}

function updateTicketBadge() {
  const badge = document.getElementById('ticket-badge');
  if (badge && appState.currentTicket) {
    badge.textContent = appState.currentTicket.status;
    badge.className = `ticket-status-badge status-${appState.currentTicket.status.toLowerCase()}`;
  }
}

// Audio synthesizer for Apple-grade chimes
function playSuccessChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.09); // A5
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.38);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.38);
  } catch (e) {}

  if (navigator.vibrate) {
    try { navigator.vibrate([40, 60, 40]); } catch (e) {}
  }
}

function playErrorBuzz() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, ctx.currentTime);
    osc.frequency.setValueAtTime(110, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.32);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.32);
  } catch (e) {}

  if (navigator.vibrate) {
    try { navigator.vibrate([140]); } catch (e) {}
  }
}

// ==============================================================
// Validation API Communication
// ==============================================================

async function executeGateValidation(tokenString) {
  const stationId = document.getElementById('gate-station-select')?.value;
  if (!stationId) {
    showToast('Please select a turnstile station location.', 'warning');
    return;
  }
  if (!tokenString || !tokenString.trim()) {
    showToast('Token string is empty. Please scan or enter a token.', 'warning');
    return;
  }

  const endpoint = currentGateMode === 'ENTRY' ? '/api/v1/validation/entry' : '/api/v1/validation/exit';

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokenString: tokenString.trim(),
        stationId: Number(stationId)
      })
    });

    const data = await res.json();
    if (data.success) {
      showTurnstileResult(true, data.message, `[Ticket ID: ${data.ticketId}]`);
    } else {
      showTurnstileResult(false, data.reason || 'Validation rejected by gate controller.');
    }
  } catch (err) {
    showTurnstileResult(false, 'Network error with gate controller: ' + err.message);
  }
}

function handleManualValidate() {
  const token = document.getElementById('manual-token-input')?.value;
  executeGateValidation(token);
}

function pasteLastTicketToken() {
  if (appState.currentSignedToken) {
    const tokenInput = document.getElementById('manual-token-input');
    if (tokenInput) tokenInput.value = appState.currentSignedToken;
    showToast('Pasted active ticket token.', 'info', 2000);
  } else {
    showToast('No recent ticket issued in this session yet.', 'warning');
  }
}

function testTamperedToken() {
  if (!appState.currentSignedToken) {
    showToast('Issue a ticket first using the planner/checkout.', 'warning');
    return;
  }
  const [payload, sig] = appState.currentSignedToken.split('.');
  const forgedToken = `${payload}.${sig.slice(0, -4)}fake`;
  const tokenInput = document.getElementById('manual-token-input');
  if (tokenInput) tokenInput.value = forgedToken;
  executeGateValidation(forgedToken);
}

function testReplayScan() {
  handleManualValidate();
}

// ==============================================================
// MOBILE CAMERA QR SCANNER & LIVE VIEWFINDER
// High performance html5-qrcode with camera picker,
// mobile camera direct snap & torch support
// ==============================================================

async function toggleCameraScanner() {
  if (isScannerRunning) {
    stopCameraScanner();
    return;
  }
  startCameraScanner();
}

async function startCameraScanner() {
  const btn = document.getElementById('btn-toggle-camera');
  const readerDiv = document.getElementById('camera-reader');
  const reticle = document.getElementById('scanner-reticle-overlay');
  const cameraSelectWrap = document.getElementById('camera-select-wrap');
  const cameraSelect = document.getElementById('camera-select');

  if (typeof Html5Qrcode === 'undefined') {
    showToast('Camera QR library not loaded. Please use manual token input or photo snap.', 'danger');
    return;
  }

  readerDiv.style.display = 'block';
  if (reticle) reticle.style.display = 'block';

  if (!html5QrScanner) {
    html5QrScanner = new Html5Qrcode('camera-reader');
  }

  try {
    // Enumerate available video devices
    try {
      availableCameras = await Html5Qrcode.getCameras();
    } catch (e) {
      availableCameras = [];
    }

    if (cameraSelect && availableCameras.length > 1) {
      cameraSelect.innerHTML = '';
      availableCameras.forEach((cam, idx) => {
        const opt = document.createElement('option');
        opt.value = cam.id;
        opt.textContent = cam.label || `Camera ${idx + 1}`;
        cameraSelect.appendChild(opt);
      });
      if (cameraSelectWrap) cameraSelectWrap.style.display = 'block';
    }

    // Determine ideal camera (prefer rear/environment camera on phones)
    let cameraConfig = { facingMode: { ideal: 'environment' } };
    if (availableCameras.length > 0) {
      const backCam = availableCameras.find(c =>
        c.label.toLowerCase().includes('back') ||
        c.label.toLowerCase().includes('rear') ||
        c.label.toLowerCase().includes('environment')
      );
      if (backCam) {
        cameraConfig = backCam.id;
        currentCameraId = backCam.id;
        if (cameraSelect) cameraSelect.value = backCam.id;
      } else {
        cameraConfig = availableCameras[0].id;
        currentCameraId = availableCameras[0].id;
      }
    }

    const qrConfig = {
      fps: 15,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
        const edge = Math.floor(minEdge * 0.75);
        return { width: edge, height: edge };
      },
      aspectRatio: 1.0
    };

    await html5QrScanner.start(
      cameraConfig,
      qrConfig,
      (decodedText) => {
        // Scanned successfully!
        showToast('QR Pass detected by turnstile camera!', 'success', 2500);
        const tokenInput = document.getElementById('manual-token-input');
        if (tokenInput) tokenInput.value = decodedText;
        executeGateValidation(decodedText);
        stopCameraScanner();
      },
      (error) => {
        // Frame scanning without QR code; continuous scan
      }
    );

    isScannerRunning = true;
    if (btn) {
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="9" x2="15" y2="15"></line><line x1="15" y1="9" x2="9" y2="15"></line></svg> Stop Camera Scanner`;
      btn.className = 'btn btn-danger btn-block';
    }

    const torchBtn = document.getElementById('btn-toggle-torch');
    if (torchBtn) torchBtn.style.display = 'inline-flex';

  } catch (err) {
    if (reticle) reticle.style.display = 'none';
    readerDiv.style.display = 'none';
    isScannerRunning = false;
    console.error('Camera startup error:', err);
    showToast(
      'Camera access unavailable (' + (err.message || 'Permission denied or non-HTTPS connection') + '). Please use "Snap QR Photo" below which works everywhere!',
      'warning',
      6000
    );
  }
}

async function stopCameraScanner() {
  const btn = document.getElementById('btn-toggle-camera');
  const readerDiv = document.getElementById('camera-reader');
  const reticle = document.getElementById('scanner-reticle-overlay');
  const torchBtn = document.getElementById('btn-toggle-torch');
  const cameraSelectWrap = document.getElementById('camera-select-wrap');

  if (html5QrScanner && isScannerRunning) {
    try {
      await html5QrScanner.stop();
      html5QrScanner.clear();
    } catch (e) {
      console.warn('Error stopping scanner:', e);
    }
  }

  isScannerRunning = false;
  isTorchOn = false;
  if (readerDiv) readerDiv.style.display = 'none';
  if (reticle) reticle.style.display = 'none';
  if (torchBtn) torchBtn.style.display = 'none';
  if (cameraSelectWrap) cameraSelectWrap.style.display = 'none';

  if (btn) {
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg> Start Camera Scanner`;
    btn.className = 'btn btn-primary btn-block';
  }
}

async function handleCameraSelectChange() {
  const select = document.getElementById('camera-select');
  if (!select || !select.value) return;

  if (isScannerRunning) {
    await stopCameraScanner();
    currentCameraId = select.value;
    await startCameraScanner();
  }
}

async function toggleTorch() {
  if (!html5QrScanner || !isScannerRunning) return;
  const torchBtn = document.getElementById('btn-toggle-torch');

  try {
    isTorchOn = !isTorchOn;
    await html5QrScanner.applyVideoConstraints({
      advanced: [{ torch: isTorchOn }]
    });
    if (torchBtn) {
      torchBtn.classList.toggle('active', isTorchOn);
      torchBtn.innerHTML = isTorchOn
        ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/></svg> Torch On`
        : `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/></svg> Flashlight`;
    }
  } catch (err) {
    showToast('Torch not supported on this camera device.', 'info');
  }
}

// -------------------------------------------------------------
// MOBILE CAMERA INSTANT PHOTO / FILE SCAN
// Works seamlessly on ANY phone browser (iOS Safari & Android)
// even when WebRTC camera streams are blocked!
// -------------------------------------------------------------

function triggerMobilePhotoInput() {
  const fileInput = document.getElementById('mobile-photo-input');
  if (fileInput) {
    fileInput.value = '';
    fileInput.click();
  }
}

async function handleMobilePhotoSelected(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  showToast('Processing photo from camera...', 'info', 3000);

  if (typeof Html5Qrcode === 'undefined') {
    showToast('QR decoder library is not available.', 'danger');
    return;
  }

  // Create temporary scanner instance if not present
  const scanner = html5QrScanner || new Html5Qrcode('camera-reader');

  try {
    const decodedText = await scanner.scanFile(file, true);
    if (decodedText) {
      showToast('QR Code successfully decoded from photo!', 'success', 2500);
      const tokenInput = document.getElementById('manual-token-input');
      if (tokenInput) tokenInput.value = decodedText;
      executeGateValidation(decodedText);
    } else {
      showToast('No QR code detected in the photo. Please make sure the QR code is clearly visible and well-lit.', 'warning', 4500);
    }
  } catch (err) {
    showToast('Could not find a valid QR code in photo. Try holding camera closer or tap Use Last Ticket.', 'warning', 4500);
  }
}

// ==============================================================
// Live Validation Event Logs
// ==============================================================

async function loadValidationEvents() {
  const tbody = document.getElementById('validation-events-tbody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/v1/validation/events?limit=15');
    const data = await res.json();
    if (!data.success) return;

    if (!data.events || data.events.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-tertiary); padding:20px;">No gate validation scans yet.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    data.events.forEach(ev => {
      const tr = document.createElement('tr');
      const timeStr = new Date(ev.timestamp).toLocaleTimeString();
      const statusBadge = ev.status === 'SUCCESS'
        ? '<span class="apple-badge badge-green">GRANTED</span>'
        : '<span class="apple-badge badge-red">REJECTED</span>';

      const typeBadge = ev.event_type === 'ENTRY'
        ? '<span style="color:var(--apple-green); font-weight:700;">ENTRY</span>'
        : '<span style="color:var(--apple-red); font-weight:700;">EXIT</span>';

      tr.innerHTML = `
        <td style="color:var(--text-secondary); font-family:var(--font-mono); font-size:0.82rem;">${timeStr}</td>
        <td>${typeBadge}</td>
        <td><strong>${ev.station_name || 'Station #' + ev.station_id}</strong></td>
        <td>${statusBadge}</td>
        <td style="font-size:0.84rem; color:var(--text-secondary);">${ev.reason}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.warn('Failed to load validation events:', err);
  }
}
