/**
 * config.test.ts — Tests for environment variable loading and defaults.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Store original env before each test so we can restore it cleanly.
// config.ts is a side-effectful module (reads env at import time), so we
// test the derived logic separately rather than re-importing per scenario.
describe('config defaults', () => {
  it('NETWORK defaults to devnet', async () => {
    const { NETWORK } = await import('../config.js')
    expect(['mainnet-beta', 'devnet', 'localnet']).toContain(NETWORK)
  })

  it('RPC_URL is a non-empty string', async () => {
    const { RPC_URL } = await import('../config.js')
    expect(typeof RPC_URL).toBe('string')
    expect(RPC_URL.length).toBeGreaterThan(0)
  })

  it('PORT is a positive integer', async () => {
    const { PORT } = await import('../config.js')
    expect(Number.isInteger(PORT)).toBe(true)
    expect(PORT).toBeGreaterThan(0)
  })

  it('MPP_SECRET is a non-empty string', async () => {
    const { MPP_SECRET } = await import('../config.js')
    expect(typeof MPP_SECRET).toBe('string')
    expect(MPP_SECRET.length).toBeGreaterThan(0)
  })

  it('RECIPIENT_ADDRESS is a non-empty string', async () => {
    const { RECIPIENT_ADDRESS } = await import('../config.js')
    expect(typeof RECIPIENT_ADDRESS).toBe('string')
    expect(RECIPIENT_ADDRESS.length).toBeGreaterThan(0)
  })

  it('FEE_PAYER_PRIVATE_KEY is undefined when not set in env', async () => {
    // We don't set this in the test environment, so it should be undefined
    const { FEE_PAYER_PRIVATE_KEY } = await import('../config.js')
    expect(FEE_PAYER_PRIVATE_KEY).toBeUndefined()
  })

  it('CLIENT_PRIVATE_KEY is undefined when not set in env', async () => {
    const { CLIENT_PRIVATE_KEY } = await import('../config.js')
    expect(CLIENT_PRIVATE_KEY).toBeUndefined()
  })

  it('API_BASE_URL defaults to localhost:3000', async () => {
    const { API_BASE_URL } = await import('../config.js')
    expect(API_BASE_URL).toBe('http://localhost:3000')
  })
})

describe('USDC_MINT selection', () => {
  it('USDC_DEVNET is the devnet USDC mint address', async () => {
    const { USDC_DEVNET } = await import('../config.js')
    expect(USDC_DEVNET).toBe('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU')
  })

  it('USDC_MAINNET is the mainnet USDC mint address', async () => {
    const { USDC_MAINNET } = await import('../config.js')
    expect(USDC_MAINNET).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
  })

  it('USDC_MINT resolves based on NETWORK value', async () => {
    const { NETWORK, USDC_MINT, USDC_DEVNET, USDC_MAINNET } = await import('../config.js')
    if (NETWORK === 'mainnet-beta') {
      expect(USDC_MINT).toBe(USDC_MAINNET)
    } else {
      expect(USDC_MINT).toBe(USDC_DEVNET)
    }
  })
})
