/**
 * client-demo.ts — Demonstrates the raw 402 payment flow step-by-step,
 * without the automatic handling in @solana/mpp/client.
 *
 * Useful for understanding what happens under the hood or for building
 * a custom client in a language that doesn't have an MPP library yet.
 *
 * Flow:
 *   Step 1 — Send unauthenticated request → receive 402 challenge
 *   Step 2 — Parse challenge from www-authenticate header
 *   Step 3 — Build + sign Solana transaction
 *   Step 4 — Encode transaction as base64 credential
 *   Step 5 — Resend request with Authorization header
 *   Step 6 — Server verifies on-chain → returns data + receipt
 *
 * Run:
 *   npm run client:demo
 */

import {
  createKeyPairSignerFromBytes,
  getBase58Codec,
  createSolanaRpc,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  compileTransaction,
  getBase64EncodedWireTransaction,
  signTransaction,
  address,
} from '@solana/web3.js'
import { getTransferSolInstruction } from '@solana-program/system'
import { CLIENT_PRIVATE_KEY, API_BASE_URL, RPC_URL } from './config.js'

if (!CLIENT_PRIVATE_KEY) {
  console.error('CLIENT_PRIVATE_KEY not set in .env')
  process.exit(1)
}

const signerBytes = getBase58Codec().decode(CLIENT_PRIVATE_KEY)
const signer = await createKeyPairSignerFromBytes(signerBytes)
const rpc = createSolanaRpc(RPC_URL)

console.log('=== MPP Raw Payment Flow Demo ===\n')
console.log(`Wallet: ${signer.address}`)
console.log(`Server: ${API_BASE_URL}\n`)

const endpoint = `${API_BASE_URL}/api/price/SOL`

// ─── Step 1: Unauthenticated request ─────────────────────────────────────────

console.log('Step 1 — Sending unauthenticated request...')
const initialResponse = await fetch(endpoint)

if (initialResponse.status !== 402) {
  // Already paid (cached) or free endpoint
  const body = await initialResponse.json()
  console.log('No payment required:', body)
  process.exit(0)
}

console.log(`  → ${initialResponse.status} Payment Required`)

// ─── Step 2: Parse the www-authenticate challenge ─────────────────────────────
//
// Header format (simplified):
//   www-authenticate: mppx challenge="<base64-encoded-JSON>"
//
// The decoded JSON contains: amount, currency, recipient, methodDetails
// (recentBlockhash, feePayer, network, splits, etc.)

const authHeader = initialResponse.headers.get('www-authenticate') ?? ''
console.log('\nStep 2 — Parsing www-authenticate header...')
console.log(`  Raw: ${authHeader.slice(0, 80)}...`)

const challengeMatch = authHeader.match(/challenge="([^"]+)"/)
if (!challengeMatch) throw new Error('No challenge in www-authenticate')

const challenge = JSON.parse(
  Buffer.from(challengeMatch[1]!, 'base64url').toString('utf8'),
)

console.log('  Parsed challenge:')
console.log(JSON.stringify(challenge, null, 4).replace(/^/gm, '    '))

const { amount, currency, recipient, methodDetails } = challenge
const { recentBlockhash, feePayer: serverPaysFee, feePayerKey } = methodDetails ?? {}

// ─── Step 3: Build + sign Solana transaction ──────────────────────────────────

console.log('\nStep 3 — Building Solana transaction...')

// Fetch a fresh blockhash if the server didn't include one
const { value: latestBlockhash } = recentBlockhash
  ? { value: { blockhash: recentBlockhash, lastValidBlockHeight: BigInt(0) } }
  : await rpc.getLatestBlockhash().send()

const feePayer = serverPaysFee
  ? address(feePayerKey) // server sponsors gas
  : signer.address       // client pays own gas

const transferIx = getTransferSolInstruction({
  source: signer.address,
  destination: address(recipient),
  amount: BigInt(amount),
})

const tx = await pipe(
  createTransactionMessage({ version: 0 }),
  (m) => setTransactionMessageFeePayer(feePayer, m),
  (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
  (m) => appendTransactionMessageInstruction(transferIx, m),
)

const compiledTx = compileTransaction(tx)

// Full sign if client pays fees; partial sign if server pays
const signedTx = serverPaysFee
  ? await signTransaction([signer.keyPair], compiledTx) // partial sign
  : await signTransaction([signer.keyPair], compiledTx)

const base64Tx = getBase64EncodedWireTransaction(signedTx)

console.log('  Transaction built and signed.')
console.log(`  Base64 length: ${base64Tx.length} chars`)

// ─── Step 4: Encode credential ────────────────────────────────────────────────

console.log('\nStep 4 — Encoding credential...')

const credential = {
  payload: {
    transaction: base64Tx,
    type: 'transaction',
  },
}

const authValue =
  'mppx credential="' +
  Buffer.from(JSON.stringify(credential)).toString('base64url') +
  '"'

console.log(`  Authorization: ${authValue.slice(0, 60)}...`)

// ─── Step 5: Retry request with credential ────────────────────────────────────

console.log('\nStep 5 — Retrying request with payment credential...')

const paidResponse = await fetch(endpoint, {
  headers: { Authorization: authValue },
})

// ─── Step 6: Receive data + receipt ──────────────────────────────────────────

console.log(`\nStep 6 — Server response: ${paidResponse.status}`)

const receiptHeader = paidResponse.headers.get('x-mpp-receipt')
if (receiptHeader) {
  const receipt = JSON.parse(
    Buffer.from(receiptHeader, 'base64url').toString('utf8'),
  )
  console.log('\nPayment Receipt:')
  console.log(JSON.stringify(receipt, null, 4).replace(/^/gm, '  '))
}

if (paidResponse.ok) {
  const data = await paidResponse.json()
  console.log('\nAPI Data:')
  console.log(JSON.stringify(data, null, 4).replace(/^/gm, '  '))
} else {
  console.error('Request failed:', await paidResponse.text())
}
