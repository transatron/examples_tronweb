/**
 * Business case: Hot wallet processes a batch of USDT withdrawals to different wallets.
 *
 * Uses ACCOUNT_PAYMENT mode (spender API key) — fees deducted from company's
 * prepaid TFN/TFU balance. Each withdrawal goes through the standard 3-step
 * TRC20 flow: estimate → simulate → build → sign → broadcast.
 */
import { config } from '../config/env.js';
import { TOKENS } from '../config/tokens.js';
import { createSpenderTronWeb } from '../lib/tronweb-factory.js';
import { formatSun, hexToUnicode } from '../lib/format.js';
import { estimateFeeLimit, simulateTransaction, buildLocalTransaction } from '../lib/trc20.js';
import { prepareTransaction } from '../lib/tx-prepare.js';
import { broadcastTransaction } from '../lib/broadcast.js';
import { sleep } from '../lib/sleep.js';
import type { MutableTransaction } from '../types/index.js';

const TOKEN = TOKENS.USDT;
const TRANSACTION_INTERVAL_MS = 2000;

// Hardcoded withdrawal batch — in production this would come from a database or queue
const WITHDRAWALS: { address: string; amount: number }[] = [
  { address: config.TARGET_ADDRESS, amount: 5000 },
  { address: config.TARGET_ADDRESS, amount: 8500 }
];

(async () => {
  try {
    const tronWeb = createSpenderTronWeb();
    const senderAddress = tronWeb.defaultAddress.base58 as string;

    console.log('=== Hot Wallet — Batch USDT Withdrawals ===');
    console.log('Sender (hot wallet):', senderAddress);
    console.log('Token:', TOKEN);
    console.log('Withdrawals:', WITHDRAWALS.length);
    console.log('');

    const results: { address: string; amount: number; txid: string; status: string }[] = [];

    for (let i = 0; i < WITHDRAWALS.length; i++) {
      const { address, amount } = WITHDRAWALS[i];
      console.log(`--- Withdrawal ${i + 1}/${WITHDRAWALS.length}: ${amount} to ${address} ---`);

      // Step 1: Estimate feeLimit
      const { feeLimit } = await estimateFeeLimit(tronWeb, TOKEN, address, amount, senderAddress);

      // Step 2: Simulate to get fee quotes
      const txWrap = await simulateTransaction(tronWeb, TOKEN, address, amount, senderAddress, feeLimit);
      const tt = txWrap.transatron;
      console.log('Transatron code:', tt.code, 'message:', hexToUnicode(tt.message));
      console.log('Account fee:', formatSun(tt.tx_fee_rtrx_account), 'TFN /', formatSun(tt.tx_fee_rusdt_account), 'TFU');

      // Step 3: Build local, sign, broadcast
      const localTx = await buildLocalTransaction(tronWeb, TOKEN, address, amount, senderAddress, feeLimit);
      // Replace reference block with solidified (fork-proof) block
      const unsignedTx = await prepareTransaction(tronWeb, localTx.transaction as MutableTransaction);
      const signedTx = await tronWeb.trx.sign(unsignedTx, config.PRIVATE_KEY);
      const broadcastResult = await broadcastTransaction(tronWeb, signedTx, { waitForConfirmation: true });

      results.push({
        address,
        amount,
        txid: broadcastResult.txid,
        status: broadcastResult.transatron?.code ?? (broadcastResult.result ? 'OK' : 'FAILED'),
      });

      if (i < WITHDRAWALS.length - 1 && TRANSACTION_INTERVAL_MS > 0) {
        await sleep(TRANSACTION_INTERVAL_MS);
      }
    }

    // Summary report
    console.log('\n=== Withdrawal Summary ===');
    console.log('─'.repeat(100));
    console.log(`${'#'.padEnd(4)} ${'Address'.padEnd(36)} ${'Amount'.padEnd(10)} ${'Status'.padEnd(12)} TxID`);
    console.log('─'.repeat(100));
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      console.log(
        `${String(i + 1).padEnd(4)} ${r.address.padEnd(36)} ${String(r.amount).padEnd(10)} ${r.status.padEnd(12)} ${r.txid}`,
      );
    }
    console.log('─'.repeat(100));
    console.log(`Total: ${results.length} withdrawals processed.`);

    console.log('\nDone.');
  } catch (error) {
    console.error('Error:', error);
  }
})();
