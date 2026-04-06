# MPP API Payments Example

Pay-per-use API access using the [Solana MPP SDK](https://github.com/solana-foundation/mpp-sdk) (Micropayment Protocol). Clients pay on-chain with SOL or USDC and receive data in return — no API keys, no accounts, no subscriptions.

## How it works

```
Client                                    Server
  │                                          │
  │  GET /api/price/SOL                      │
  │ ─────────────────────────────────────── ▶│
  │                                          │ (not paid yet)
  │◀─ 402 Payment Required ─────────────────┤
  │   www-authenticate: mppx challenge="..." │
  │                                          │
  │  (MPP client builds + signs Solana tx)   │
  │                                          │
  │  GET /api/price/SOL                      │
  │  Authorization: mppx credential="..."    │
  │ ─────────────────────────────────────── ▶│
  │                                          │ (verifies on-chain)
  │◀─ 200 OK + x-mpp-receipt ───────────────┤
  │   { symbol: "SOL", price: 142.5, ... }   │
```

The `@solana/mpp/client` library handles the entire `402 → pay → retry` loop automatically inside `mppx.fetch()`.

## Endpoints

| Endpoint | Price | Currency |
|---|---|---|
| `GET /api/price/:symbol` | 0.001 | SOL |
| `GET /api/analysis/:symbol` | 0.01 | SOL |
| `GET /api/report/:symbol` | 0.05 + 10% platform split | USDC |
| `GET /health` | free | — |

## Quick start

### 1. Install dependencies

```bash
npm install
```

### 2. Generate keypairs

```bash
# Generate a recipient/fee-payer keypair for the server
npm run keygen

# Generate a client wallet keypair
npm run keygen
```

### 3. Configure environment

```bash
cp .env.example .env
# Fill in the addresses and keys printed by keygen
```

### 4. Fund wallets on devnet

```bash
# Fund both wallets
solana airdrop 2 <SERVER_ADDRESS> --url devnet
solana airdrop 2 <CLIENT_ADDRESS> --url devnet

# Get devnet USDC for the client (use a devnet faucet or the MPP demo faucet)
```

### 5. Run the server

```bash
npm run server
```

### 6. Run the client

```bash
# Automatic payment flow (uses @solana/mpp/client)
npm run client

# Step-by-step raw flow demo (shows what happens under the hood)
npm run client:demo
```

## Project structure

```
src/
├── config.ts        — Environment variable loading
├── server.ts        — Express API server with MPP payment gates
├── client.ts        — Automated client using @solana/mpp/client
├── client-demo.ts   — Raw 402 flow, step by step (educational)
└── keygen.ts        — Generate Solana keypairs
```

## Key concepts

### Pull mode (default)

The client builds and signs the transaction, then sends the raw bytes to the server. The server co-signs (if sponsoring fees), broadcasts, and confirms on-chain before returning data.

```typescript
solana.charge({ signer, broadcast: false }) // pull mode
```

### Push mode

The client builds, signs, broadcasts, and confirms the transaction, then sends only the signature to the server for verification.

```typescript
solana.charge({ signer, broadcast: true }) // push mode
```

### Fee sponsorship

When `FEE_PAYER_PRIVATE_KEY` is set, the server's wallet covers Solana transaction fees. The client still pays the data price; only the ~0.000005 SOL network fee is comped.

```typescript
// server.ts
solana.charge({ recipient, signer: feePayerSigner })
```

### Payment splits

The report endpoint demonstrates splitting a single charge across multiple recipients:

```typescript
solana.charge({
  recipient: dataProviderAddress,   // 90%
  splits: [
    { recipient: platformAddress, amount: '5000' }, // 10% platform fee
  ],
})
```

### Replay prevention

MPP marks each transaction signature as consumed. The default store is in-memory (single process). For production, plug in a persistent store:

```typescript
import { Store } from '@solana/mpp/server'

const store = Store.create({
  async get(key) { return redis.get(key) },
  async set(key, value) { await redis.set(key, value, 'EX', 3600) },
})

solana.charge({ recipient, store })
```

## Security notes

- Set `MPP_SECRET` to a random 32-byte hex value in production (`openssl rand -hex 32`). This HMAC key binds challenges to your server instance so they can't be replayed against other servers.
- The server validates every transaction on-chain before returning data — it verifies amounts, recipients, and that the signature hasn't been used before.
- Never commit `.env` to version control.
