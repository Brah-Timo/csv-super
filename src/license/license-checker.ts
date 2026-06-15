/**
 * LicenseChecker — Verifies Pro license keys.
 *
 * Verification strategy (two-tier):
 *   1. Online  → POST to api.csv-super.dev (3s timeout)
 *   2. Offline → Local JWT signature verification (fallback when no network)
 *
 * The offline fallback ensures Pro features keep working even when
 * the verification server is temporarily unreachable.
 *
 * License keys are JWTs signed with csv-super.dev's private RSA key.
 * This file contains only the public key — the private key never leaves
 * csv-super.dev servers.
 */

import { JwtVerifier } from './jwt-verifier.js';
import { LicenseError } from '../errors/LicenseError.js';
import {
  VERIFY_ENDPOINT,
  VERIFY_TIMEOUT_MS,
  LICENSE_PUBLIC_KEY,
} from './license-types.js';
import type { LicenseInfo, LicenseTier } from '../types/index.js';

/** In-memory cache to avoid re-verifying on every call in the same process. */
interface CacheEntry {
  info: LicenseInfo;
  cachedAt: number; // performance.now()
}

/** Cache TTL: 1 hour in ms. */
const CACHE_TTL_MS = 60 * 60 * 1_000;

export class LicenseChecker {
  private static cache = new Map<string, CacheEntry>();

  /**
   * Verify a license key and return full license info.
   *
   * @throws LicenseError on invalid/expired/malformed key.
   */
  static async verify(licenseKey: string): Promise<LicenseInfo> {
    if (!licenseKey || typeof licenseKey !== 'string' || licenseKey.trim() === '') {
      throw new LicenseError(
        'No license key provided. Get your Pro key at https://csv-super.dev/pro',
        'INVALID_KEY',
      );
    }

    // ── Check in-memory cache ─────────────────────────────────────────────
    const cached = LicenseChecker.cache.get(licenseKey);
    if (cached !== undefined) {
      const age = performance.now() - cached.cachedAt;
      if (age < CACHE_TTL_MS) {
        return cached.info;
      }
      LicenseChecker.cache.delete(licenseKey);
    }

    // ── Try online verification first ────────────────────────────────────
    let info: LicenseInfo | null = null;

    try {
      info = await LicenseChecker.verifyOnline(licenseKey);
    } catch (err) {
      if (err instanceof LicenseError) {
        // Definitive server-side rejection — don't fall through
        if (err.reason !== 'NETWORK_ERROR') { throw err; }
      }
      // Network error → try offline
    }

    // ── Offline verification fallback ────────────────────────────────────
    if (info === null) {
      info = LicenseChecker.verifyOffline(licenseKey);
    }

    // ── Cache the result ─────────────────────────────────────────────────
    LicenseChecker.cache.set(licenseKey, { info, cachedAt: performance.now() });

    return info;
  }

  /**
   * Quick boolean check — returns true/false instead of throwing.
   */
  static async isValid(licenseKey: string): Promise<boolean> {
    try {
      await LicenseChecker.verify(licenseKey);
      return true;
    } catch {
      return false;
    }
  }

  // ── Private: Online verification ─────────────────────────────────────────

  private static async verifyOnline(key: string): Promise<LicenseInfo> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

    try {
      const response = await fetch(VERIFY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
        signal: controller.signal,
      });

      if (response.status === 401 || response.status === 403) {
        throw new LicenseError('Invalid or revoked license key.', 'INVALID_KEY');
      }

      if (response.status === 402) {
        throw new LicenseError(
          'License has expired. Renew at https://csv-super.dev/pro',
          'EXPIRED',
        );
      }

      if (!response.ok) {
        throw new LicenseError(
          `Verification server error: HTTP ${response.status}`,
          'NETWORK_ERROR',
        );
      }

      const body = await response.json() as {
        valid: boolean;
        info: LicenseInfo;
        reason?: string;
      };

      if (!body.valid) {
        throw new LicenseError(
          body.reason ?? 'License rejected by server.',
          'INVALID_KEY',
        );
      }

      return body.info;

    } catch (err) {
      if (err instanceof LicenseError) { throw err; }

      // AbortError = timeout
      const isAbort = err instanceof Error && err.name === 'AbortError';
      const isNetwork = err instanceof TypeError && err.message.includes('fetch');

      if (isAbort || isNetwork) {
        throw new LicenseError(
          'Cannot reach verification server. Will attempt offline verification.',
          'NETWORK_ERROR',
        );
      }

      throw new LicenseError(
        `Verification failed: ${err instanceof Error ? err.message : String(err)}`,
        'NETWORK_ERROR',
      );

    } finally {
      clearTimeout(timer);
    }
  }

  // ── Private: Offline verification ────────────────────────────────────────

  private static verifyOffline(key: string): LicenseInfo {
    const payload = JwtVerifier.verify(key, LICENSE_PUBLIC_KEY);

    if (payload.tier !== 'pro' && payload.tier !== 'enterprise') {
      throw new LicenseError(
        `License tier '${payload.tier as string}' does not include Pro features.`,
        'WRONG_TIER',
      );
    }

    const info: LicenseInfo = {
      tier:           payload.tier as LicenseTier,
      keyId:          payload.sub,
      email:          payload.email,
      issuedAt:       payload.iat,
      expiresAt:      payload.exp ?? null,
      seats:          payload.seats,
      verifiedOnline: false,
      features:       payload.features,
    };
    if (payload.org !== undefined) {
      info.organization = payload.org;
    }
    return info;
  }

  /** Clear the in-process cache (useful in tests). */
  static clearCache(): void {
    LicenseChecker.cache.clear();
  }
}
