/**
 * LicenseError — Thrown when a Pro license is invalid, expired, or missing.
 *
 * @example
 * ```typescript
 * import { LicenseError } from 'csv-super';
 *
 * try {
 *   for await (const batch of csvSuperPro('data.csv', { licenseKey: key })) { ... }
 * } catch (err) {
 *   if (err instanceof LicenseError) {
 *     console.error('License issue:', err.message);
 *     console.error('Get a key at: https://csv-super.dev/pro');
 *   }
 * }
 * ```
 */

import { CsvSuperError } from './CsvSuperError.js';

export type LicenseErrorReason =
  | 'INVALID_KEY'
  | 'EXPIRED'
  | 'WRONG_TIER'
  | 'SEATS_EXCEEDED'
  | 'NETWORK_ERROR'
  | 'MALFORMED_TOKEN';

export class LicenseError extends CsvSuperError {
  /** Machine-readable reason code for the license failure. */
  readonly reason: LicenseErrorReason;

  /** URL where the user can renew or purchase a license. */
  readonly renewUrl = 'https://csv-super.dev/pro';

  constructor(message: string, reason: LicenseErrorReason = 'INVALID_KEY') {
    super(message, 'CSV_SUPER_LICENSE_ERROR');
    this.name = 'LicenseError';
    this.reason = reason;
  }
}
