/**
 * data.test.ts — Unit tests for the data-generation functions.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  priceData,
  analysisData,
  reportData,
  MOCK_PRICES,
  MOCK_ANALYSIS,
} from '../data.js'

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── priceData ────────────────────────────────────────────────────────────────

describe('priceData', () => {
  it('returns null for an unknown symbol', () => {
    expect(priceData('UNKNOWN')).toBeNull()
    expect(priceData('DOGE')).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(priceData('')).toBeNull()
  })

  it('returns a PriceData object for a known symbol', () => {
    const result = priceData('SOL')
    expect(result).not.toBeNull()
    expect(result!.symbol).toBe('SOL')
    expect(result!.price).toBe(MOCK_PRICES['SOL'])
  })

  it('normalises symbol to uppercase', () => {
    const result = priceData('sol')
    expect(result).not.toBeNull()
    expect(result!.symbol).toBe('SOL')
  })

  it('returns correct prices for all known symbols', () => {
    for (const [symbol, expectedPrice] of Object.entries(MOCK_PRICES)) {
      const result = priceData(symbol)
      expect(result).not.toBeNull()
      expect(result!.price).toBe(expectedPrice)
    }
  })

  it('returned object has the expected shape', () => {
    const result = priceData('BTC')
    expect(result).toMatchObject({
      symbol: 'BTC',
      price: expect.any(Number),
      change24h: expect.stringMatching(/%$/),
      volume24h: expect.stringMatching(/^\$/),
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    })
  })

  it('timestamp is a valid ISO date', () => {
    const result = priceData('ETH')
    expect(new Date(result!.timestamp).toISOString()).toBe(result!.timestamp)
  })

  it('change24h uses Math.random — different calls can differ', () => {
    // priceData calls Math.random() twice: once for change24h, once for volume24h.
    // Provide 4 values so both priceData() calls are fully covered.
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)   // 1st call: change24h → (0*10-5) = -5.00%
      .mockReturnValueOnce(0.5) // 1st call: volume24h (ignored by assertion)
      .mockReturnValueOnce(1)   // 2nd call: change24h → (1*10-5) = 5.00%
      .mockReturnValueOnce(0.5) // 2nd call: volume24h (ignored by assertion)
    const a = priceData('SOL')!.change24h
    const b = priceData('SOL')!.change24h
    expect(a).toBe('-5.00%')
    expect(b).toBe('5.00%')
  })
})

// ─── analysisData ─────────────────────────────────────────────────────────────

describe('analysisData', () => {
  it('returns an object for any symbol (never null)', () => {
    expect(analysisData('UNKNOWN')).toBeTruthy()
    expect(analysisData('SOL')).toBeTruthy()
  })

  it('normalises symbol to uppercase', () => {
    const result = analysisData('eth')
    expect(result.symbol).toBe('ETH')
  })

  it('uses the known analysis text for recognised symbols', () => {
    for (const [symbol, text] of Object.entries(MOCK_ANALYSIS)) {
      expect(analysisData(symbol).summary).toBe(text)
    }
  })

  it('falls back to generic message for unknown symbol', () => {
    const result = analysisData('UNKNOWN')
    expect(result.summary).toBe('No analysis available for this asset.')
  })

  it('returned object has the expected shape', () => {
    const result = analysisData('BTC')
    expect(result).toMatchObject({
      symbol: 'BTC',
      summary: expect.any(String),
      signals: {
        trend: expect.stringMatching(/^(bullish|bearish)$/),
        rsi: expect.stringMatching(/^\d+\.\d$/),
        macd: expect.stringMatching(/^-?\d+\.\d{3}$/),
      },
      generatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    })
  })

  it('trend is bullish when Math.random > 0.5', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    expect(analysisData('SOL').signals.trend).toBe('bullish')
  })

  it('trend is bearish when Math.random <= 0.5', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.3)
    expect(analysisData('SOL').signals.trend).toBe('bearish')
  })

  it('rsi is within the expected range given deterministic Math.random', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    // rsi = (30 + 0.5 * 40).toFixed(1) = '50.0'
    expect(analysisData('SOL').signals.rsi).toBe('50.0')
  })
})

// ─── reportData ───────────────────────────────────────────────────────────────

describe('reportData', () => {
  it('normalises symbol to uppercase', () => {
    expect(reportData('eth').symbol).toBe('ETH')
  })

  it('always returns 4 sections', () => {
    expect(reportData('SOL').sections).toHaveLength(4)
    expect(reportData('UNKNOWN').sections).toHaveLength(4)
  })

  it('sections have correct titles', () => {
    const titles = reportData('BTC').sections.map((s) => s.title)
    expect(titles).toEqual([
      'Price History',
      'On-chain Metrics',
      'Competitor Analysis',
      'Risk Assessment',
    ])
  })

  it('totalPages equals sum of all section pages', () => {
    const report = reportData('ETH')
    const pageSum = report.sections.reduce((acc, s) => acc + s.pages, 0)
    expect(report.totalPages).toBe(pageSum)
  })

  it('uses known analysis text as executiveSummary for recognised symbols', () => {
    for (const [symbol, text] of Object.entries(MOCK_ANALYSIS)) {
      expect(reportData(symbol).executiveSummary).toBe(text)
    }
  })

  it('uses fallback executiveSummary for unknown symbol', () => {
    expect(reportData('UNKNOWN').executiveSummary).toBe(
      'Insufficient data for full report.',
    )
  })

  it('format field is present', () => {
    expect(reportData('SOL').format).toContain('JSON')
  })

  it('generatedAt is a valid ISO timestamp', () => {
    const { generatedAt } = reportData('SOL')
    expect(new Date(generatedAt).toISOString()).toBe(generatedAt)
  })
})
