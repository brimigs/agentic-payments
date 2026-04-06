/**
 * app.ts — Express application factory.
 *
 * Separated from server.ts so the app can be imported in tests
 * without binding to a port.
 */

import express, { type Express } from 'express'
import { Mppx, solana } from '@solana/mpp/server'
import {
  NETWORK,
  RPC_URL,
  MPP_SECRET,
  RECIPIENT_ADDRESS,
  FEE_PAYER_PRIVATE_KEY,
  USDC_MINT,
} from './config.js'
import { priceData, analysisData, reportData } from './data.js'

async function loadFeePayerSigner() {
  if (!FEE_PAYER_PRIVATE_KEY) return undefined
  const { createKeyPairSignerFromBytes, getBase58Codec } = await import(
    '@solana/web3.js'
  )
  const bytes = getBase58Codec().decode(FEE_PAYER_PRIVATE_KEY)
  return createKeyPairSignerFromBytes(bytes)
}

export async function createApp(): Promise<Express> {
  const feePayerSigner = await loadFeePayerSigner()

  const baseCharge = {
    network: NETWORK,
    rpcUrl: RPC_URL,
    ...(feePayerSigner ? { signer: feePayerSigner } : {}),
  }

  const solBasic = solana.charge({
    ...baseCharge,
    recipient: RECIPIENT_ADDRESS,
    currency: 'sol',
  })

  const solAnalysis = solana.charge({
    ...baseCharge,
    recipient: RECIPIENT_ADDRESS,
    currency: 'sol',
  })

  const PLATFORM_FEE_ADDRESS = RECIPIENT_ADDRESS

  const usdcReport = solana.charge({
    ...baseCharge,
    recipient: RECIPIENT_ADDRESS,
    currency: USDC_MINT,
    decimals: 6,
    splits: [
      {
        recipient: PLATFORM_FEE_ADDRESS,
        amount: '5000',
        memo: 'platform-fee',
      },
    ],
  })

  const mppxBasic = Mppx.create({ methods: [solBasic], secret: MPP_SECRET })
  const mppxAnalysis = Mppx.create({ methods: [solAnalysis], secret: MPP_SECRET })
  const mppxReport = Mppx.create({ methods: [usdcReport], secret: MPP_SECRET })

  const app = express()
  app.use(express.json())

  // ─── Health ───────────────────────────────────────────────────────────────

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

  // ─── Tier 1: Basic price — 0.001 SOL ──────────────────────────────────────

  app.get('/api/price/:symbol', async (req, res) => {
    const symbol = req.params['symbol']!.toUpperCase()

    const result = await mppxBasic.charge({
      amount: '100000',
      currency: 'sol',
      description: `Price data for ${symbol}`,
      externalId: `price:${symbol}:${Date.now()}`,
    })(req as any)

    if (result.status === 402) {
      res.status(402).set(result.headers).json(result.body)
      return
    }

    const data = priceData(symbol)
    if (!data) {
      res.status(404).json({ error: `Unknown symbol: ${symbol}` })
      return
    }

    res.set(result.receiptHeaders()).json(data)
  })

  // ─── Tier 2: AI analysis — 0.01 SOL ───────────────────────────────────────

  app.get('/api/analysis/:symbol', async (req, res) => {
    const symbol = req.params['symbol']!.toUpperCase()

    const result = await mppxAnalysis.charge({
      amount: '10000000',
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

  // ─── Tier 3: Full report — 0.05 USDC + platform split ─────────────────────

  app.get('/api/report/:symbol', async (req, res) => {
    const symbol = req.params['symbol']!.toUpperCase()

    const result = await mppxReport.charge({
      amount: '50000',
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

  return app
}
