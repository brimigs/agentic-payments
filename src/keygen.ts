/**
 * keygen.ts — Generate a fresh Solana keypair and print its addresses.
 *
 * Usage:
 *   npm run keygen
 *
 * Prints the Base58 public key (use as RECIPIENT_ADDRESS) and the Base58
 * private key (use as FEE_PAYER_PRIVATE_KEY or CLIENT_PRIVATE_KEY).
 *
 * Never commit private keys. Store them only in your .env file.
 */

import { generateKeyPair, getBase58Codec } from '@solana/web3.js'

const keypair = await generateKeyPair()
const codec = getBase58Codec()

const publicKeyBytes = keypair.publicKey.toBytes
  ? keypair.publicKey.toBytes()
  : new Uint8Array((keypair.publicKey as unknown as { bytes: Uint8Array }).bytes)

const privateKeyBytes = await crypto.subtle.exportKey('raw', keypair.privateKey)

console.log('─'.repeat(60))
console.log('New Solana keypair generated')
console.log('─'.repeat(60))
console.log('Public key (use as RECIPIENT_ADDRESS):')
console.log(' ', codec.encode(publicKeyBytes))
console.log()
console.log('Private key bytes (Base58, use as FEE_PAYER_PRIVATE_KEY):')
console.log(' ', codec.encode(new Uint8Array(privateKeyBytes)))
console.log('─'.repeat(60))
console.log('Fund this address on devnet:')
console.log(`  solana airdrop 2 ${codec.encode(publicKeyBytes)} --url devnet`)
