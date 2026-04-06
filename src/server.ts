/**
 * server.ts — Entry point. Creates the Express app and starts listening.
 *
 * Run:
 *   npm run server
 */

import { createApp } from './app.js'
import { PORT, NETWORK, RPC_URL, RECIPIENT_ADDRESS, FEE_PAYER_PRIVATE_KEY } from './config.js'

const app = await createApp()

app.listen(PORT, () => {
  console.log(`\nMPP API server running on http://localhost:${PORT}`)
  console.log(`Network  : ${NETWORK}`)
  console.log(`RPC      : ${RPC_URL}`)
  console.log(`Recipient: ${RECIPIENT_ADDRESS}`)
  console.log(`Fee payer: ${FEE_PAYER_PRIVATE_KEY ? 'configured' : 'client pays (none configured)'}`)
  console.log('\nEndpoints:')
  console.log('  GET /health')
  console.log('  GET /api/price/:symbol     — 0.001 SOL')
  console.log('  GET /api/analysis/:symbol  — 0.01  SOL')
  console.log('  GET /api/report/:symbol    — 0.05  USDC\n')
})
