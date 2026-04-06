/**
 * challenge.test.ts — Unit tests for challenge parsing and credential encoding.
 */

import { describe, it, expect } from 'vitest'
import {
  parseChallenge,
  encodeCredential,
  decodeReceipt,
  type Challenge,
  type TransactionCredential,
  type SignatureCredential,
} from '../challenge.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeHeader(payload: object): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `mppx challenge="${encoded}"`
}

// ─── parseChallenge ───────────────────────────────────────────────────────────

describe('parseChallenge', () => {
  const validChallenge: Challenge = {
    amount: '100000',
    currency: 'sol',
    recipient: '11111111111111111111111111111111',
  }

  it('parses a valid www-authenticate header', () => {
    const header = makeHeader(validChallenge)
    const result = parseChallenge(header)
    expect(result).toEqual(validChallenge)
  })

  it('returns null for an empty string', () => {
    expect(parseChallenge('')).toBeNull()
  })

  it('returns null when the challenge key is missing', () => {
    expect(parseChallenge('mppx realm="example"')).toBeNull()
  })

  it('returns null for a non-base64url challenge value', () => {
    expect(parseChallenge('mppx challenge="!!not-valid-base64!!"')).toBeNull()
  })

  it('returns null when the decoded value is not valid JSON', () => {
    const bad = Buffer.from('not json').toString('base64url')
    expect(parseChallenge(`mppx challenge="${bad}"`)).toBeNull()
  })

  it('preserves methodDetails in the parsed result', () => {
    const withDetails: Challenge = {
      ...validChallenge,
      methodDetails: {
        network: 'devnet',
        feePayer: true,
        feePayerKey: 'FeePayerAddr...',
        recentBlockhash: 'blockhash123',
      },
    }
    const result = parseChallenge(makeHeader(withDetails))
    expect(result?.methodDetails?.network).toBe('devnet')
    expect(result?.methodDetails?.feePayer).toBe(true)
    expect(result?.methodDetails?.feePayerKey).toBe('FeePayerAddr...')
    expect(result?.methodDetails?.recentBlockhash).toBe('blockhash123')
  })

  it('preserves splits in methodDetails', () => {
    const withSplits: Challenge = {
      ...validChallenge,
      methodDetails: {
        splits: [{ recipient: 'PlatformAddr...', amount: '5000', memo: 'fee' }],
      },
    }
    const result = parseChallenge(makeHeader(withSplits))
    expect(result?.methodDetails?.splits).toHaveLength(1)
    expect(result?.methodDetails?.splits![0]!.memo).toBe('fee')
  })

  it('preserves optional description and externalId fields', () => {
    const full: Challenge = {
      ...validChallenge,
      description: 'Price data for SOL',
      externalId: 'price:SOL:12345',
    }
    const result = parseChallenge(makeHeader(full))
    expect(result?.description).toBe('Price data for SOL')
    expect(result?.externalId).toBe('price:SOL:12345')
  })
})

// ─── encodeCredential ─────────────────────────────────────────────────────────

describe('encodeCredential', () => {
  it('produces a string starting with "mppx credential="', () => {
    const cred: TransactionCredential = {
      payload: { transaction: 'base64txbytes', type: 'transaction' },
    }
    expect(encodeCredential(cred)).toMatch(/^mppx credential="/)
  })

  it('encodes a transaction credential round-trip correctly', () => {
    const cred: TransactionCredential = {
      payload: { transaction: 'AAABBBCCC', type: 'transaction' },
    }
    const header = encodeCredential(cred)
    const match = header.match(/credential="([^"]+)"/)
    expect(match).not.toBeNull()
    const decoded = JSON.parse(
      Buffer.from(match![1]!, 'base64url').toString('utf8'),
    )
    expect(decoded).toEqual(cred)
  })

  it('encodes a signature credential round-trip correctly', () => {
    const cred: SignatureCredential = {
      payload: { signature: '5SIG...', type: 'signature' },
    }
    const header = encodeCredential(cred)
    const match = header.match(/credential="([^"]+)"/)
    const decoded = JSON.parse(
      Buffer.from(match![1]!, 'base64url').toString('utf8'),
    )
    expect(decoded.payload.type).toBe('signature')
    expect(decoded.payload.signature).toBe('5SIG...')
  })

  it('wraps the encoded value in double quotes', () => {
    const cred: TransactionCredential = {
      payload: { transaction: 'tx', type: 'transaction' },
    }
    const header = encodeCredential(cred)
    expect(header).toMatch(/^mppx credential="[^"]+"$/)
  })
})

// ─── decodeReceipt ────────────────────────────────────────────────────────────

describe('decodeReceipt', () => {
  it('decodes a valid base64url receipt header', () => {
    const receipt = {
      reference: '5AbcTxSignature...',
      timestamp: '2026-04-06T00:00:00.000Z',
      challengeId: 'abc123',
    }
    const encoded = Buffer.from(JSON.stringify(receipt)).toString('base64url')
    expect(decodeReceipt(encoded)).toEqual(receipt)
  })

  it('returns null for an empty string', () => {
    expect(decodeReceipt('')).toBeNull()
  })

  it('returns null for non-base64url input', () => {
    expect(decodeReceipt('!!!invalid!!!')).toBeNull()
  })

  it('returns null when decoded value is not valid JSON', () => {
    const bad = Buffer.from('not json here').toString('base64url')
    expect(decodeReceipt(bad)).toBeNull()
  })

  it('preserves all fields in the decoded receipt', () => {
    const receipt = { a: 1, b: 'two', c: [3] }
    const encoded = Buffer.from(JSON.stringify(receipt)).toString('base64url')
    const decoded = decodeReceipt(encoded)
    expect(decoded).toEqual({ a: 1, b: 'two', c: [3] })
  })
})
