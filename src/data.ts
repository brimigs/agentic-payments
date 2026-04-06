/**
 * data.ts — Simulated data sources for the API endpoints.
 *
 * In a real service these would call a database, external price feed,
 * or ML model. Extracted here so they can be unit-tested independently
 * of the MPP payment logic.
 */

export const MOCK_PRICES: Record<string, number> = {
  SOL: 142.5,
  BTC: 67_800,
  ETH: 3_420,
  USDC: 1.0,
  JTO: 3.87,
}

export const MOCK_ANALYSIS: Record<string, string> = {
  SOL: 'Strong uptrend driven by institutional inflows and ecosystem growth. RSI at 62 indicates room before overbought territory.',
  BTC: 'Consolidating near ATH with declining volatility. Options market pricing low near-term movement.',
  ETH: 'Layer-2 activity hitting record highs, reducing mainnet congestion. Positive signal for fee burn rate.',
}

export interface PriceData {
  symbol: string
  price: number
  change24h: string
  volume24h: string
  timestamp: string
}

export interface AnalysisData {
  symbol: string
  summary: string
  signals: {
    trend: 'bullish' | 'bearish'
    rsi: string
    macd: string
  }
  generatedAt: string
}

export interface ReportSection {
  title: string
  pages: number
}

export interface ReportData {
  symbol: string
  executiveSummary: string
  sections: ReportSection[]
  totalPages: number
  format: string
  generatedAt: string
}

export function priceData(symbol: string): PriceData | null {
  const s = symbol.toUpperCase()
  const price = MOCK_PRICES[s]
  if (!price) return null
  return {
    symbol: s,
    price,
    change24h: (Math.random() * 10 - 5).toFixed(2) + '%',
    volume24h: '$' + (Math.random() * 1e9).toFixed(0),
    timestamp: new Date().toISOString(),
  }
}

export function analysisData(symbol: string): AnalysisData {
  const s = symbol.toUpperCase()
  const summary = MOCK_ANALYSIS[s] ?? 'No analysis available for this asset.'
  return {
    symbol: s,
    summary,
    signals: {
      trend: Math.random() > 0.5 ? 'bullish' : 'bearish',
      rsi: (30 + Math.random() * 40).toFixed(1),
      macd: (Math.random() * 2 - 1).toFixed(3),
    },
    generatedAt: new Date().toISOString(),
  }
}

export function reportData(symbol: string): ReportData {
  const s = symbol.toUpperCase()
  return {
    symbol: s,
    executiveSummary: MOCK_ANALYSIS[s] ?? 'Insufficient data for full report.',
    sections: [
      { title: 'Price History', pages: 3 },
      { title: 'On-chain Metrics', pages: 5 },
      { title: 'Competitor Analysis', pages: 4 },
      { title: 'Risk Assessment', pages: 2 },
    ],
    totalPages: 14,
    format: 'JSON (PDF available on request)',
    generatedAt: new Date().toISOString(),
  }
}
