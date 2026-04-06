/**
 * client.ts — Automated API client that pays for access using Solana MPP.
 *
 * This client uses @solana/mpp/client which wraps fetch() so that:
 *   1. It sends the request normally.
 *   2. If the server returns 402, it reads the www-authenticate challenge,
 *      builds + signs a Solana transaction, and retries with the credential.
 *   3. The caller sees a normal successful Response — payment is transparent.
 *
 * Run:
 *   npm run client
 *
 * Prerequisites:
 *   - Server running: npm run server
 *   - CLIENT_PRIVATE_KEY set in .env (funded with SOL + USDC on devnet)
 */

import { Mppx, solana } from '@solana/mpp/client'
import { createKeyPairSignerFromBytes, getBase58Codec } from '@solana/web3.js'
import { CLIENT_PRIVATE_KEY, API_BASE_URL, RPC_URL, NETWORK } from './config.js'

// ─── Load signer ──────────────────────────────────────────────────────────────

if (!CLIENT_PRIVATE_KEY) {
  console.error(
    'Error: CLIENT_PRIVATE_KEY not set in .env\n' +
    'Generate a keypair with: npm run keygen\n' +
    'Then fund it on devnet:  solana airdrop 2 <address> --url devnet',
  )
  process.exit(1)
}

const signerBytes = getBase58Codec().decode(CLIENT_PRIVATE_KEY)
const signer = await createKeyPairSignerFromBytes(signerBytes)

console.log(`Client wallet: ${signer.address}`)
console.log(`API server   : ${API_BASE_URL}`)
console.log(`Network      : ${NETWORK}\n`)

// ─── Configure MPP client ─────────────────────────────────────────────────────
//
// solana.charge() tells the client HOW to pay when a 402 is encountered:
//   - signer        : wallet that signs the payment transaction
//   - broadcast     : false = "pull" mode (server broadcasts); recommended
//   - rpcUrl        : which Solana node to use
//   - onProgress    : optional callback for each payment lifecycle stage
//
// Mppx.create() wraps the method and exposes mppx.fetch(), which behaves
// exactly like the built-in fetch() but handles 402 automatically.

const paymentMethod = solana.charge({
  signer,
  broadcast: false, // pull mode: server co-signs and broadcasts
  rpcUrl: RPC_URL,
  computeUnitPrice: 100n, // priority fee in micro-lamports
  onProgress(event) {
    switch (event.type) {
      case 'challenge':
        console.log(
          `  [MPP] Challenge received — paying ${event.amount} ${event.currency}`,
        )
        break
      case 'signing':
        console.log('  [MPP] Signing transaction...')
        break
      case 'signed':
        console.log('  [MPP] Transaction signed, submitting credential...')
        break
      case 'paid':
        console.log(`  [MPP] Payment confirmed: ${event.signature}\n`)
        break
    }
  },
})

const mppx = Mppx.create({ methods: [paymentMethod] })

// ─── Helper: fetch with payment + pretty-print ───────────────────────────────

async function paidFetch(label: string, path: string) {
  console.log(`── ${label} ─────────────────────────────────────`)
  console.log(`  GET ${API_BASE_URL}${path}`)

  const response = await mppx.fetch(`${API_BASE_URL}${path}`)

  if (!response.ok) {
    console.error(`  Error ${response.status}: ${await response.text()}`)
    return
  }

  const data = await response.json()
  console.log('  Response:')
  console.log(JSON.stringify(data, null, 4).replace(/^/gm, '  '))
  console.log()
}

// ─── Make paid API calls ──────────────────────────────────────────────────────

// Tier 1: Basic price data (0.001 SOL)
await paidFetch('Tier 1 — Basic price data (0.001 SOL)', '/api/price/SOL')

// Tier 2: AI market analysis (0.01 SOL)
await paidFetch('Tier 2 — Market analysis (0.01 SOL)', '/api/analysis/BTC')

// Tier 3: Full report with USDC + platform split (0.05 USDC)
await paidFetch(
  'Tier 3 — Full report in USDC (0.05 USDC + 10% platform fee)',
  '/api/report/ETH',
)

console.log('All requests completed.')
