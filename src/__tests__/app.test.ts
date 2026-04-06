/**
 * app.test.ts — Integration tests for the Express route handlers.
 *
 * @solana/mpp/server is fully mocked so no real Solana network calls happen.
 * The mock simulates the MPP lifecycle:
 *   - No Authorization header  → 402 challenge response
 *   - Authorization header set → 200 receipt response
 */

import { vi, describe, it, expect, beforeAll } from 'vitest'
import type { Express } from 'express'
import request from 'supertest'

// ─── Mock @solana/mpp/server ─────────────────────────────────────────────────
//
// vi.mock is hoisted before imports, so this runs before createApp() is loaded.
// The inner chargeHandler mimics Mppx.create().charge(params)(req) behaviour.

vi.mock('@solana/mpp/server', () => {
  const chargeHandler = vi.fn(
    (chargeParams: { amount: string; currency: string }) =>
      async (req: { headers: Record<string, string | undefined> }) => {
        if (req.headers['authorization']) {
          return {
            status: 200,
            receiptHeaders: () => ({
              'x-mpp-receipt': Buffer.from(
                JSON.stringify({ reference: 'mock-tx-sig', timestamp: new Date().toISOString() }),
              ).toString('base64url'),
            }),
          }
        }
        return {
          status: 402,
          headers: {
            'www-authenticate': `mppx challenge="${Buffer.from(
              JSON.stringify({
                amount: chargeParams.amount,
                currency: chargeParams.currency,
                recipient: '11111111111111111111111111111111',
                methodDetails: { network: 'devnet' },
              }),
            ).toString('base64url')}"`,
          },
          body: { error: 'Payment required', amount: chargeParams.amount },
        }
      },
  )

  return {
    solana: { charge: vi.fn().mockReturnValue({ _mock: true }) },
    Mppx: { create: vi.fn().mockReturnValue({ charge: chargeHandler }) },
  }
})

// Import AFTER mock registration
import { createApp } from '../app.js'

// ─── Setup ────────────────────────────────────────────────────────────────────

let app: Express

beforeAll(async () => {
  app = await createApp()
})

// ─── GET /health ──────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
  })

  it('returns status: ok', async () => {
    const res = await request(app).get('/health')
    expect(res.body.status).toBe('ok')
  })

  it('returns network field', async () => {
    const res = await request(app).get('/health')
    expect(res.body.network).toBeDefined()
  })

  it('lists all three paid endpoints', async () => {
    const res = await request(app).get('/health')
    expect(res.body.endpoints).toHaveProperty('GET /api/price/:symbol')
    expect(res.body.endpoints).toHaveProperty('GET /api/analysis/:symbol')
    expect(res.body.endpoints).toHaveProperty('GET /api/report/:symbol')
  })
})

// ─── GET /api/price/:symbol ───────────────────────────────────────────────────

describe('GET /api/price/:symbol', () => {
  describe('without payment', () => {
    it('returns 402', async () => {
      const res = await request(app).get('/api/price/SOL')
      expect(res.status).toBe(402)
    })

    it('includes www-authenticate header', async () => {
      const res = await request(app).get('/api/price/SOL')
      expect(res.headers['www-authenticate']).toMatch(/^mppx challenge="/)
    })

    it('challenge contains amount and currency', async () => {
      const res = await request(app).get('/api/price/SOL')
      const raw = res.headers['www-authenticate'].match(/challenge="([^"]+)"/)?.[1]
      const challenge = JSON.parse(Buffer.from(raw!, 'base64url').toString('utf8'))
      expect(challenge.amount).toBe('100000')
      expect(challenge.currency).toBe('sol')
    })

    it('returns JSON body with error field', async () => {
      const res = await request(app).get('/api/price/SOL')
      expect(res.body).toHaveProperty('error')
    })
  })

  describe('with payment credential', () => {
    const AUTH = 'mppx credential="mock"'

    it('returns 200 for a known symbol', async () => {
      const res = await request(app).get('/api/price/SOL').set('Authorization', AUTH)
      expect(res.status).toBe(200)
    })

    it('returns price data shape', async () => {
      const res = await request(app).get('/api/price/SOL').set('Authorization', AUTH)
      expect(res.body).toMatchObject({
        symbol: 'SOL',
        price: expect.any(Number),
        change24h: expect.stringMatching(/%$/),
        volume24h: expect.stringMatching(/^\$/),
        timestamp: expect.any(String),
      })
    })

    it('normalises symbol to uppercase', async () => {
      const res = await request(app).get('/api/price/sol').set('Authorization', AUTH)
      expect(res.status).toBe(200)
      expect(res.body.symbol).toBe('SOL')
    })

    it('returns 404 for an unknown symbol', async () => {
      const res = await request(app).get('/api/price/FAKECOIN').set('Authorization', AUTH)
      expect(res.status).toBe(404)
      expect(res.body.error).toMatch(/FAKECOIN/)
    })

    it('includes x-mpp-receipt header', async () => {
      const res = await request(app).get('/api/price/BTC').set('Authorization', AUTH)
      expect(res.headers['x-mpp-receipt']).toBeDefined()
    })

    it('x-mpp-receipt decodes to a JSON object with reference field', async () => {
      const res = await request(app).get('/api/price/ETH').set('Authorization', AUTH)
      const raw = res.headers['x-mpp-receipt']
      const decoded = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
      expect(decoded).toHaveProperty('reference')
    })
  })
})

// ─── GET /api/analysis/:symbol ────────────────────────────────────────────────

describe('GET /api/analysis/:symbol', () => {
  describe('without payment', () => {
    it('returns 402', async () => {
      const res = await request(app).get('/api/analysis/BTC')
      expect(res.status).toBe(402)
    })

    it('includes www-authenticate header', async () => {
      const res = await request(app).get('/api/analysis/BTC')
      expect(res.headers['www-authenticate']).toMatch(/^mppx challenge="/)
    })

    it('challenge amount is 10000000 (0.01 SOL)', async () => {
      const res = await request(app).get('/api/analysis/BTC')
      const raw = res.headers['www-authenticate'].match(/challenge="([^"]+)"/)?.[1]
      const challenge = JSON.parse(Buffer.from(raw!, 'base64url').toString('utf8'))
      expect(challenge.amount).toBe('10000000')
    })
  })

  describe('with payment credential', () => {
    const AUTH = 'mppx credential="mock"'

    it('returns 200', async () => {
      const res = await request(app).get('/api/analysis/BTC').set('Authorization', AUTH)
      expect(res.status).toBe(200)
    })

    it('returns analysis data shape', async () => {
      const res = await request(app).get('/api/analysis/BTC').set('Authorization', AUTH)
      expect(res.body).toMatchObject({
        symbol: 'BTC',
        summary: expect.any(String),
        signals: {
          trend: expect.stringMatching(/^(bullish|bearish)$/),
          rsi: expect.any(String),
          macd: expect.any(String),
        },
        generatedAt: expect.any(String),
      })
    })

    it('normalises symbol to uppercase', async () => {
      const res = await request(app).get('/api/analysis/eth').set('Authorization', AUTH)
      expect(res.body.symbol).toBe('ETH')
    })

    it('returns a summary for an unknown symbol (no 404 — analysis always available)', async () => {
      const res = await request(app).get('/api/analysis/UNKNOWN').set('Authorization', AUTH)
      expect(res.status).toBe(200)
      expect(res.body.summary).toBe('No analysis available for this asset.')
    })

    it('includes x-mpp-receipt header', async () => {
      const res = await request(app).get('/api/analysis/SOL').set('Authorization', AUTH)
      expect(res.headers['x-mpp-receipt']).toBeDefined()
    })
  })
})

// ─── GET /api/report/:symbol ──────────────────────────────────────────────────

describe('GET /api/report/:symbol', () => {
  describe('without payment', () => {
    it('returns 402', async () => {
      const res = await request(app).get('/api/report/ETH')
      expect(res.status).toBe(402)
    })

    it('includes www-authenticate header', async () => {
      const res = await request(app).get('/api/report/ETH')
      expect(res.headers['www-authenticate']).toMatch(/^mppx challenge="/)
    })

    it('challenge amount is 50000 (0.05 USDC)', async () => {
      const res = await request(app).get('/api/report/ETH')
      const raw = res.headers['www-authenticate'].match(/challenge="([^"]+)"/)?.[1]
      const challenge = JSON.parse(Buffer.from(raw!, 'base64url').toString('utf8'))
      expect(challenge.amount).toBe('50000')
    })

    it('challenge currency is USDC mint address (not "sol")', async () => {
      const res = await request(app).get('/api/report/ETH')
      const raw = res.headers['www-authenticate'].match(/challenge="([^"]+)"/)?.[1]
      const challenge = JSON.parse(Buffer.from(raw!, 'base64url').toString('utf8'))
      // Currency must be a mint address, not the literal string "sol"
      expect(challenge.currency).not.toBe('sol')
      expect(challenge.currency.length).toBeGreaterThan(10)
    })
  })

  describe('with payment credential', () => {
    const AUTH = 'mppx credential="mock"'

    it('returns 200', async () => {
      const res = await request(app).get('/api/report/ETH').set('Authorization', AUTH)
      expect(res.status).toBe(200)
    })

    it('returns report data shape', async () => {
      const res = await request(app).get('/api/report/ETH').set('Authorization', AUTH)
      expect(res.body).toMatchObject({
        symbol: 'ETH',
        executiveSummary: expect.any(String),
        sections: expect.any(Array),
        totalPages: expect.any(Number),
        format: expect.any(String),
        generatedAt: expect.any(String),
      })
    })

    it('returns 4 sections', async () => {
      const res = await request(app).get('/api/report/SOL').set('Authorization', AUTH)
      expect(res.body.sections).toHaveLength(4)
    })

    it('totalPages equals sum of section pages', async () => {
      const res = await request(app).get('/api/report/BTC').set('Authorization', AUTH)
      const sum = res.body.sections.reduce(
        (acc: number, s: { pages: number }) => acc + s.pages,
        0,
      )
      expect(res.body.totalPages).toBe(sum)
    })

    it('normalises symbol to uppercase', async () => {
      const res = await request(app).get('/api/report/btc').set('Authorization', AUTH)
      expect(res.body.symbol).toBe('BTC')
    })

    it('uses fallback summary for unknown symbol', async () => {
      const res = await request(app).get('/api/report/UNKNOWNCOIN').set('Authorization', AUTH)
      expect(res.status).toBe(200)
      expect(res.body.executiveSummary).toBe('Insufficient data for full report.')
    })

    it('includes x-mpp-receipt header', async () => {
      const res = await request(app).get('/api/report/SOL').set('Authorization', AUTH)
      expect(res.headers['x-mpp-receipt']).toBeDefined()
    })
  })
})

// ─── 404 for unknown routes ───────────────────────────────────────────────────

describe('unknown routes', () => {
  it('returns 404 for a completely unknown path', async () => {
    const res = await request(app).get('/api/unknown-endpoint')
    expect(res.status).toBe(404)
  })
})
