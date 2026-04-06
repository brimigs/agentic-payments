/**
 * config.ts — Shared configuration loaded from environment variables.
 *
 * Copy .env.example → .env and fill in your values before running.
 */

import 'dotenv/config'

function require(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required env var: ${key}`)
  return val
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback
}

// ─── Shared ──────────────────────────────────────────────────────────────────

export const NETWORK = optional('NETWORK', 'devnet') as
  | 'mainnet-beta'
  | 'devnet'
  | 'localnet'

export const RPC_URL = optional('RPC_URL', 'https://api.devnet.solana.com')

// ─── Server ──────────────────────────────────────────────────────────────────

export const PORT = parseInt(optional('PORT', '3000'), 10)
export const MPP_SECRET = optional('MPP_SECRET', 'dev-secret-change-in-prod')
export const RECIPIENT_ADDRESS = optional(
  'RECIPIENT_ADDRESS',
  // Placeholder — replace with your actual devnet address
  '11111111111111111111111111111111',
)
export const FEE_PAYER_PRIVATE_KEY = process.env['FEE_PAYER_PRIVATE_KEY']

// ─── Client ──────────────────────────────────────────────────────────────────

export const CLIENT_PRIVATE_KEY = process.env['CLIENT_PRIVATE_KEY']
export const API_BASE_URL = optional('API_BASE_URL', 'http://localhost:3000')

// ─── Token addresses (devnet USDC) ───────────────────────────────────────────

export const USDC_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
export const USDC_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

export const USDC_MINT =
  NETWORK === 'mainnet-beta' ? USDC_MAINNET : USDC_DEVNET
