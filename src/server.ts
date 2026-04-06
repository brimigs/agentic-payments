/**
 * server.ts — Pay-per-use API server powered by Solana MPP.
 *
 * Exposes three tiers of data endpoints, each requiring an on-chain
 * micropayment before the server returns the requested resource:
 *
 *   GET /api/price/:symbol          → 0.001 SOL  (basic ticker data)
 *   GET /api/analysis/:symbol       → 0.01  SOL  (AI market analysis)
 *   GET /api/report/:symbol         → 0.05  USDC (full PDF-style report,
 *                                                  with platform split)
 *
 * Payment flow (automated / machine-to-machine):
 *   1. Client sends unauthenticated GET request.
 *   2. Server returns 402 with a www-authenticate challenge header.
 *   3. Client builds a Solana transaction matching the challenge,
 *      signs it, and resends the request with an Authorization header.
 *   4. Server verifies the transaction on-chain and returns the data.
 *
 * The entire 402 → pay → retry loop is handled transparently by the
 * @solana/mpp client library (see client.ts).
 */

import express from 'express'
import { Mppx, solana } from '@solana/mpp/server'
import {
  NETWORK,
  RPC_URL,
  PORT,
  MPP_SECRET,
  RECIPIENT_ADDRESS,
  FEE_PAYER_PRIVATE_KEY,
  USDC_MINT,
} from './config.js'

// ─── Optional: load fee-payer signer for server-sponsored tx fees ─────────────
//
// When a fee-payer signer is configured the server covers the Solana tx fee
// (~0.000005 SOL) on behalf of the client. The client still pays the
// requested amount; only the network fee is comped.
//
// For this example we skip fee sponsorship unless FEE_PAYER_PRIVATE_KEY is set,
// so the server runs without any funded wallet during local development.

async function loadFeePayerSigner() {
  if (!FEE_PAYER_PRIVATE_KEY) return undefined

  // Lazy import so the server starts even without @solana/signers installed
  const { createKeyPairSignerFromBytes, getBase58Codec } = await import(
    '@solana/web3.js'
  )
  const bytes = getBase58Codec().decode(FEE_PAYER_PRIVATE_KEY)
  return createKeyPairSignerFromBytes(bytes)
}

// ─── Build MPP payment methods ────────────────────────────────────────────────

const feePayerSigner = await loadFeePayerSigner()

/**
 * solBasic — charges 0.001 SOL (100,000 lamports).
 * Used for lightweight price-ticker calls.
 */
const solBasic = solana.charge({
  recipient: RECIPIENT_ADDRESS,
  currency: 'sol',
  network: NETWORK,
  rpcUrl: RPC_URL,
  ...(feePayerSigner ? { signer: feePayerSigner } : {}),
})

/**
 * solAnalysis — charges 0.01 SOL (10,000,000 lamports).
 * Used for AI-generated market analysis.
 */
const solAnalysis = solana.charge({
  recipient: RECIPIENT_ADDRESS,
  currency: 'sol',
  network: NETWORK,
  rpcUrl: RPC_URL,
  ...(feePayerSigner ? { signer: feePayerSigner } : {}),
})

/**
 * usdcReport — charges 0.05 USDC with a 10% platform split.
 * Used for full market reports. Demonstrates payment splitting.
 *
 * Pricing breakdown per request:
 *   0.045 USDC → data provider (RECIPIENT_ADDRESS)
 *   0.005 USDC → platform fee  (same address for demo, use a separate one)
 */
const PLATFORM_FEE_ADDRESS = RECIPIENT_ADDRESS // use a distinct address in production

const usdcReport = solana.charge({
  recipient: RECIPIENT_ADDRESS,
  currency: USDC_MINT,
  decimals: 6,
  network: NETWORK,
  rpcUrl: RPC_URL,
  splits: [
    {
      recipient: PLATFORM_FEE_ADDRESS,
      amount: '5000', // 0.005 USDC (6 decimals)
      memo: 'platform-fee',
    },
  ],
  ...(feePayerSigner ? { signer: feePayerSigner } : {}),
})

// ─── Create Mppx instances (one per charge config) ───────────────────────────
//
// Mppx wraps a charge method and handles the full 402 lifecycle:
//   - Issuing signed HMAC challenges
//   - Verifying incoming credentials
//   - Settling on-chain and issuing receipts

const mppxBasic = Mppx.create({ methods: [solBasic], secret: MPP_SECRET })
const mppxAnalysis = Mppx.create({ methods: [solAnalysis], secret: MPP_SECRET })
const mppxReport = Mppx.create({ methods: [usdcReport], secret: MPP_SECRET })

// ─── Simulated data sources ───────────────────────────────────────────────────

const MOCK_PRICES: Record<string, number> = {
  SOL: 142.5,
  BTC: 67_800,
  ETH: 3_420,
  USDC: 1.0,
  JTO: 3.87,
}

const MOCK_ANALYSIS: Record<string, string> = {
  SOL: 'Strong uptrend driven by institutional inflows and ecosystem growth. RSI at 62 indicates room before overbought territory.',
  BTC: 'Consolidating near ATH with declining volatility. Options market pricing low near-term movement.',
  ETH: 'Layer-2 activity hitting record highs, reducing mainnet congestion. Positive signal for fee burn rate.',
}

function priceData(symbol: string) {
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

function analysisData(symbol: string) {
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

function reportData(symbol: string) {
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

// ─── Express app ──────────────────────────────────────────────────────────────

const app = express()
app.use(express.json())

// Health check — free, no payment required
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    network: NETWORK,
    endpoints: {
      'GET /api/price/:symbol': '0.001 SOL',
      'GET /api/analysis/:symbol': '0.01 SOL',
      'GET /api/report/:symbol': '0.05 USDC (+ 10% platform split)',
    },
  })
})

// ─── Tier 1: Basic price data — 0.001 SOL ────────────────────────────────────

app.get('/api/price/:symbol', async (req, res) => {
  const symbol = req.params['symbol']!.toUpperCase()

  // mppx.charge() either:
  //   a) Returns a 402 challenge response (client hasn't paid yet), OR
  //   b) Verifies the payment and returns a receipt object
  const result = await mppxBasic.charge({
    amount: '100000', // 0.001 SOL in lamports
    currency: 'sol',
    description: `Price data for ${symbol}`,
    externalId: `price:${symbol}:${Date.now()}`,
  })(req as any)

  if (result.status === 402) {
    // Send 402 with www-authenticate challenge header
    res.status(402).set(result.headers).json(result.body)
    return
  }

  const data = priceData(symbol)
  if (!data) {
    res.status(404).json({ error: `Unknown symbol: ${symbol}` })
    return
  }

  // Attach payment receipt header and return data
  res.set(result.receiptHeaders()).json(data)
})

// ─── Tier 2: AI analysis — 0.01 SOL ─────────────────────────────────────────

app.get('/api/analysis/:symbol', async (req, res) => {
  const symbol = req.params['symbol']!.toUpperCase()

  const result = await mppxAnalysis.charge({
    amount: '10000000', // 0.01 SOL in lamports
    currency: 'sol',
    description: `Market analysis for ${symbol}`,
    externalId: `analysis:${symbol}:${Date.now()}`,
  })(req as any)

  if (result.status === 402) {
    res.status(402).set(result.headers).json(result.body)
    return
  }

  const data = analysisData(symbol)
  res.set(result.receiptHeaders()).json(data)
})

// ─── Tier 3: Full report — 0.05 USDC + platform split ────────────────────────

app.get('/api/report/:symbol', async (req, res) => {
  const symbol = req.params['symbol']!.toUpperCase()

  const result = await mppxReport.charge({
    amount: '50000', // 0.05 USDC (6 decimals)
    currency: USDC_MINT,
    description: `Full market report for ${symbol}`,
    externalId: `report:${symbol}:${Date.now()}`,
  })(req as any)

  if (result.status === 402) {
    res.status(402).set(result.headers).json(result.body)
    return
  }

  const data = reportData(symbol)
  res.set(result.receiptHeaders()).json(data)
})

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\nMPP API server running on http://localhost:${PORT}`)
  console.log(`Network : ${NETWORK}`)
  console.log(`RPC     : ${RPC_URL}`)
  console.log(`Recipient: ${RECIPIENT_ADDRESS}`)
  console.log(`Fee payer: ${feePayerSigner ? (feePayerSigner as any).address : 'client pays (none configured)'}`)
  console.log('\nEndpoints:')
  console.log('  GET /health')
  console.log('  GET /api/price/:symbol     — 0.001 SOL')
  console.log('  GET /api/analysis/:symbol  — 0.01  SOL')
  console.log('  GET /api/report/:symbol    — 0.05  USDC\n')
})
