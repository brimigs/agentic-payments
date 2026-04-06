/**
 * challenge.ts — Utilities for parsing MPP www-authenticate challenges
 * and encoding payment credentials into Authorization headers.
 *
 * These are the primitives that @solana/mpp/client uses internally.
 * Extracted here so they can be unit-tested and reused in client-demo.ts.
 */

export interface MethodDetails {
  decimals?: number
  feePayer?: boolean
  feePayerKey?: string
  network?: string
  recentBlockhash?: string
  splits?: Array<{ recipient: string; amount: string; memo?: string }>
  tokenProgram?: string
}

export interface Challenge {
  amount: string
  currency: string
  description?: string
  externalId?: string
  recipient: string
  methodDetails?: MethodDetails
}

export interface TransactionCredential {
  payload: {
    transaction: string
    type: 'transaction'
  }
}

export interface SignatureCredential {
  payload: {
    signature: string
    type: 'signature'
  }
}

export type Credential = TransactionCredential | SignatureCredential

/**
 * Parse the challenge JSON from a www-authenticate header.
 *
 * Header format:
 *   www-authenticate: mppx challenge="<base64url-encoded-JSON>"
 *
 * Returns null if the header is missing or malformed.
 */
export function parseChallenge(wwwAuthHeader: string): Challenge | null {
  const match = wwwAuthHeader.match(/challenge="([^"]+)"/)
  if (!match || !match[1]) return null

  try {
    const json = Buffer.from(match[1], 'base64url').toString('utf8')
    return JSON.parse(json) as Challenge
  } catch {
    return null
  }
}

/**
 * Encode a payment credential into an Authorization header value.
 *
 * Returns the full header value string, e.g.:
 *   mppx credential="<base64url-encoded-JSON>"
 */
export function encodeCredential(credential: Credential): string {
  const json = JSON.stringify(credential)
  const encoded = Buffer.from(json).toString('base64url')
  return `mppx credential="${encoded}"`
}

/**
 * Decode a payment receipt from an x-mpp-receipt response header.
 *
 * Returns null if the header is missing or malformed.
 */
export function decodeReceipt(receiptHeader: string): Record<string, unknown> | null {
  try {
    const json = Buffer.from(receiptHeader, 'base64url').toString('utf8')
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}
