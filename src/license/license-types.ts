/**
 * License system internal constants.
 * @internal
 */

/** Issuer claim in all csv-super license JWTs. */
export const LICENSE_ISSUER = 'csv-super.dev';

/** Online verification endpoint. */
export const VERIFY_ENDPOINT = 'https://api.csv-super.dev/v1/license/verify';

/** Online verification timeout in milliseconds. */
export const VERIFY_TIMEOUT_MS = 3_000;

/**
 * RSA-256 Public Key for offline JWT verification.
 * The corresponding private key lives ONLY on csv-super.dev servers.
 *
 * This key is used to verify license JWTs without network access.
 * Replace this with the real public key before publishing.
 */
export const LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzTGFDPlaceholder000000
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==
-----END PUBLIC KEY-----`;
