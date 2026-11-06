const crypto = require('crypto');
const QRCode = require('qrcode');

class TokenService {
  constructor(secret) {
    this.secret = secret || process.env.HMAC_SECRET || 'metro_afc_secure_local_secret_key_892347';
  }

  generateNonce() {
    return crypto.randomBytes(16).toString('hex');
  }

  generateGuestAccessToken() {
    return crypto.randomBytes(24).toString('hex');
  }

  generateTicketId() {
    return 'TKT-' + crypto.randomUUID().toUpperCase();
  }

  generateOrderId() {
    return 'ORD-' + crypto.randomUUID().toUpperCase();
  }

  /**
   * Generates an HMAC-SHA256 signed QR token string.
   * Signed payload contains strictly: ticketId, nonce, and expiry (UNIX timestamp seconds).
   * No fare or personal data is included.
   */
  createSignedToken(ticketId, nonce, expirySeconds) {
    const payload = {
      tid: String(ticketId),
      nonce: String(nonce),
      exp: Math.floor(Number(expirySeconds))
    };

    const payloadJson = JSON.stringify(payload);
    const payloadB64 = Buffer.from(payloadJson, 'utf8').toString('base64url');
    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(payloadB64)
      .digest('base64url');

    return `${payloadB64}.${signature}`;
  }

  /**
   * Verifies the cryptographic HMAC-SHA256 signature and expiry of a token.
   *
   * @param {string} tokenString
   * @param {boolean} [checkExpiry=true] - If false (e.g. for in-trip exit where 120m timeout doesn't block exit), skips clock check
   * @returns {{ valid: boolean, payload?: { tid: string, nonce: string, exp: number }, reason?: string }}
   */
  verifyToken(tokenString, checkExpiry = true) {
    if (!tokenString || typeof tokenString !== 'string') {
      return { valid: false, reason: 'Token is missing or not a string.' };
    }

    const parts = tokenString.trim().split('.');
    if (parts.length !== 2) {
      return { valid: false, reason: 'Invalid token format. Expected payload.signature.' };
    }

    const [payloadB64, signature] = parts;

    // Calculate expected HMAC
    const expectedSig = crypto
      .createHmac('sha256', this.secret)
      .update(payloadB64)
      .digest('base64url');

    // Constant-time comparison
    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expectedSig, 'utf8');

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return { valid: false, reason: 'Cryptographic signature verification failed (tampered or forged token).' };
    }

    // Decode payload
    let payload;
    try {
      const json = Buffer.from(payloadB64, 'base64url').toString('utf8');
      payload = JSON.parse(json);
    } catch {
      return { valid: false, reason: 'Malformed token payload.' };
    }

    if (!payload.tid || !payload.nonce || typeof payload.exp !== 'number') {
      return { valid: false, reason: 'Incomplete token payload.' };
    }

    if (checkExpiry) {
      const nowSec = Math.floor(Date.now() / 1000);
      if (payload.exp < nowSec) {
        return {
          valid: false,
          expired: true,
          reason: `Token expired at ${new Date(payload.exp * 1000).toISOString()}.`,
          payload
        };
      }
    }

    return { valid: true, payload };
  }

  /**
   * Generates a QR code data URI image for displaying in HTML.
   */
  async generateQrCodeDataUrl(tokenString) {
    return QRCode.toDataURL(tokenString, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 256,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });
  }
}

module.exports = TokenService;
