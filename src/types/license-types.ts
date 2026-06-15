/**
 * License system types.
 */

/**
 * Available license tiers.
 */
export type LicenseTier = 'free' | 'pro' | 'enterprise';

/**
 * Decoded license information (from JWT payload).
 */
export interface LicenseInfo {
  /** License tier */
  tier: LicenseTier;

  /** License key identifier */
  keyId: string;

  /** Email address of the license holder */
  email: string;

  /** Organization name (if applicable) */
  organization?: string;

  /** Unix timestamp of license issue date */
  issuedAt: number;

  /** Unix timestamp of license expiry (null = never expires) */
  expiresAt: number | null;

  /** Maximum allowed seats (concurrent machines) */
  seats: number;

  /** Whether verified online (true) or offline via JWT (false) */
  verifiedOnline: boolean;

  /** Features included in this license */
  features: LicenseFeatures;
}

/**
 * Feature flags associated with a license tier.
 */
export interface LicenseFeatures {
  /** Multi-thread Worker Threads processing */
  multiThread: boolean;

  /** Transform pipeline */
  transformPipeline: boolean;

  /** Maximum threads allowed */
  maxThreads: number;

  /** Priority support */
  prioritySupport: boolean;

  /** SLA guarantee */
  slaGuarantee: boolean;
}

/**
 * Raw JWT payload structure for license verification.
 * @internal — exported for use in jwt-verifier.ts
 */
export interface LicenseJwtPayload {
  sub: string;         // key ID
  email: string;
  tier: LicenseTier;
  org?: string;
  seats: number;
  features: LicenseFeatures;
  iat: number;         // issued at
  exp?: number;        // expiry (optional — some perpetual licenses have no exp)
  iss: string;         // issuer = 'csv-super.dev'
}
