/**
 * JwtVerifier — Pure Node.js JWT verifier (no external dependencies).
 *
 * Supports RS256 (RSA + SHA-256) for offline license verification.
 * Uses Node.js built-in `crypto` module — zero external dependencies.
 *
 * JWT Format: header.payload.signature (Base64URL-encoded parts)
 */

import { createVerify } from 'node:crypto';
import { LicenseError } from '../errors/LicenseError.js';
import type { LicenseJwtPayload } from '../types/index.js';

export class JwtVerifier {
  /**
   * Verify a JWT token using an RSA public key (RS256).
   *
   * @param token      The full JWT string (header.payload.signature)
   * @param publicKey  PEM-encoded RSA public key
   * @returns          Decoded and verified payload
   * @throws           LicenseError on invalid/expired/malformed token
   */
  static verify(token: string, publicKey: string): LicenseJwtPayload {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new LicenseError('Malformed JWT: expected 3 parts', 'MALFORMED_TOKEN');
    }

    const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

    // ── 1. Parse header ──────────────────────────────────────────────────
    const header = JwtVerifier.decodeBase64Json<{ alg: string; typ: string }>(headerB64);

    if (header.alg !== 'RS256') {
      throw new LicenseError(
        `Unsupported JWT algorithm: ${header.alg}. Expected RS256.`,
        'MALFORMED_TOKEN',
      );
    }

    // ── 2. Verify signature ──────────────────────────────────────────────
    const signingInput = `${headerB64}.${payloadB64}`;
    const signature = JwtVerifier.base64UrlToBuffer(signatureB64);

    const verifier = createVerify('SHA256');
    verifier.update(signingInput, 'utf8');

    const isValid = verifier.verify(publicKey, signature);
    if (!isValid) {
      throw new LicenseError('Invalid license key signature.', 'INVALID_KEY');
    }

    // ── 3. Decode payload ─────────────────────────────────────────────────
    const payload = JwtVerifier.decodeBase64Json<LicenseJwtPayload>(payloadB64);

    // ── 4. Validate claims ────────────────────────────────────────────────
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp !== undefined && payload.exp < now) {
      throw new LicenseError(
        `License expired on ${new Date(payload.exp * 1000).toISOString()}. ` +
        `Renew at https://csv-super.dev/pro`,
        'EXPIRED',
      );
    }

    if (payload.iat !== undefined && payload.iat > now + 60) {
      // Issued in the future (> 60s clock skew tolerance)
      throw new LicenseError('License issued in the future. Check system clock.', 'MALFORMED_TOKEN');
    }

    return payload;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private static base64UrlToBuffer(b64url: string): Buffer {
    // Convert Base64URL to standard Base64, then to Buffer
    const base64 = b64url
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(b64url.length + ((4 - (b64url.length % 4)) % 4), '=');

    return Buffer.from(base64, 'base64');
  }

  private static decodeBase64Json<T>(b64url: string): T {
    const buf = JwtVerifier.base64UrlToBuffer(b64url);
    const json = buf.toString('utf8');

    try {
      return JSON.parse(json) as T;
    } catch {
      throw new LicenseError(`Malformed JWT part: invalid JSON.`, 'MALFORMED_TOKEN');
    }
  }
}
