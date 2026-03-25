/**
 * Register a new TransaTron account via POST /api/v1/register.
 * Builds a signed (not broadcasted) TRX deposit transaction and submits it with an email.
 * Returns API keys, password, and account details for fully automated onboarding.
 *
 * Usage: npm run register:stage [email]
 */
import { TronWeb } from 'tronweb';
import { formatSun } from '../lib/format.js';
import { config } from '../config/env.js';
import { createUnauthenticatedTronWeb } from '../lib/tronweb-factory.js';
import { prepareTransaction } from '../lib/tx-prepare.js';
import { register } from '../lib/transatron-api.js';
import type { MutableTransaction } from '../types/index.js';

const DEFAULT_DEPOSIT_ADDRESS = 'TFPzL92nmSxLVVNHoL5cbZ6tjSxfuKUBeD';
const DEFAULT_DEPOSIT_AMOUNT_TRX = 30; // 30 TRX
const DEFAULT_REGISTRATION_EMAIL = 'user@example.com';

(async () => {
  try {
    // Public TronGrid instance for building & signing the tx (no auth needed)
    const publicTronWeb = new TronWeb({
      fullHost: 'https://api.trongrid.io',
      privateKey: config.PRIVATE_KEY,
    });
    // Unauthenticated TransaTron instance for the /register call
    const tronWeb = createUnauthenticatedTronWeb();
    const senderAddress = tronWeb.defaultAddress.base58 as string;
    // Resolve email (arg override → env override → default)
    const email = process.argv[2] || process.env.REGISTRATION_EMAIL || DEFAULT_REGISTRATION_EMAIL;

    console.log('=== Register New Account ===');
    console.log('Sender:', senderAddress);
    console.log('Email:', email);

    // Resolve deposit address
    const depositAddress = process.env.REGISTRATION_DEPOSIT_ADDRESS || DEFAULT_DEPOSIT_ADDRESS;
    console.log('Deposit address:', depositAddress);

    // Resolve deposit amount (env override → default)
    const envAmount = process.env.REGISTRATION_DEPOSIT_AMOUNT_TRX;
    const depositAmountTrx = envAmount ? Number(envAmount) : DEFAULT_DEPOSIT_AMOUNT_TRX;
    const depositAmount = depositAmountTrx * 1_000_000;
    console.log('Deposit amount:', formatSun(depositAmount), 'TRX');

    // Build and sign TRX transfer (do NOT broadcast)
    console.log('\nBuilding deposit transaction...');
    const rawTx = await publicTronWeb.transactionBuilder.sendTrx(
      depositAddress,
      depositAmount,
      senderAddress,
    );
    // Replace reference block with solidified (fork-proof) block
    const unsignedTx = await prepareTransaction(publicTronWeb, rawTx as MutableTransaction);
    const signedTx = await publicTronWeb.trx.sign(unsignedTx);

    // Register account
    const payload = { transaction: signedTx, email };
    console.log('\n--- Outgoing Payload ---');
    console.log(JSON.stringify(payload, null, 2));

    console.log('\nCalling /api/v1/register...');
    const result = await register(tronWeb, signedTx, email);

    // Print raw response for debugging
    console.log('\n--- Raw Response ---');
    console.log(JSON.stringify(result, null, 2));

    // Print parsed fields
    console.log('\n--- Account Details ---');
    console.log('Deposit Address:', result.deposit_address);
    console.log('TFN Balance:', formatSun(result.balance_rtrx), 'TFN');
    console.log('TFU Balance:', formatSun(result.balance_usdt), 'TFU');
    console.log('Energy Price:', result.energy_price_per_unit, 'per unit');
    console.log('Bandwidth Price:', result.bandwidth_price_per_unit, 'per unit');
    console.log('Activation Price:', result.activation_price);

    console.log('\n========================================================');
    console.log('  ADD THE FOLLOWING TO YOUR .env FILE');
    console.log('  These credentials will NOT be shown again!');
    console.log('========================================================');
    console.log(`TRANSATRON_API_KEY_SPENDER="${result.spender_api_key}"`);
    console.log(`TRANSATRON_API_KEY_NON_SPENDER="${result.non_spender_api_key}"`);
    console.log(`TRANSATRON_USER_EMAIL="${email}"`);
    console.log(`TRANSATRON_USER_PASSWORD="${result.password}"`);
    console.log('========================================================');
    console.log('Done.');
  } catch (error) {
    console.error('Error:', error);
  }
})();
