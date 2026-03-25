/**
 * Send TRC20 — DELAYED_TRANSACTION mode.
 * Broadcasts N transactions with bumped expiration, then flushes and verifies.
 * Uses spender API key.
 */
import { config } from '../../config/env.js';
import { TOKENS } from '../../config/tokens.js';
import { createSpenderTronWeb } from '../../lib/tronweb-factory.js';
import { hexToUnicode } from '../../lib/format.js';
import { estimateFeeLimit, simulateTransaction, buildLocalTransaction } from '../../lib/trc20.js';
import { prepareTransaction } from '../../lib/tx-prepare.js';
import { getPendingTxs, flushPendingTxs } from '../../lib/transatron-api.js';
import { broadcastTransaction } from '../../lib/broadcast.js';
import { sleep } from '../../lib/sleep.js';
import type { MutableTransaction } from '../../types/index.js';

const TOKEN = TOKENS.USDT;
const EXPIRATION_INCREASE_MIN = 60; // 1 hour
const NUMBER_OF_TRANSACTIONS = 3;
const TRANSACTION_INTERVAL_MS = 2000;

(async () => {
  try {
    const tronWeb = createSpenderTronWeb();
    const senderAddress = tronWeb.defaultAddress.base58 as string;

    console.log('=== Send TRC20 — Delayed Transaction ===');
    console.log('Sender:', senderAddress);
    console.log('Number of transactions:', NUMBER_OF_TRANSACTIONS);
    console.log('Expiration increase:', EXPIRATION_INCREASE_MIN, 'min');

    // Check pending before starting
    const pendingBefore = await getPendingTxs(tronWeb, senderAddress);
    console.log(
      `Before — pending: ${pendingBefore.pending_transactions_amount}, processing: ${pendingBefore.processing_transactions_amount}`,
    );

    // Broadcast N delayed transactions
    for (let i = 0; i < NUMBER_OF_TRANSACTIONS; i++) {
      const transferAmount = Math.floor(Math.random() * 10000) + 5000;
      console.log(`\n--- Transaction ${i + 1}/${NUMBER_OF_TRANSACTIONS} (amount: ${transferAmount}) ---`);

      // Step 1: Estimate feeLimit
      const { feeLimit } = await estimateFeeLimit(
        tronWeb,
        TOKEN,
        config.TARGET_ADDRESS,
        transferAmount,
        senderAddress,
      );

      // Step 2: Simulate to get fee quote
      const txWrap = await simulateTransaction(
        tronWeb,
        TOKEN,
        config.TARGET_ADDRESS,
        transferAmount,
        senderAddress,
        feeLimit,
      );
      console.log('Transatron code:', txWrap.transatron.code, 'message:', hexToUnicode(txWrap.transatron.message));

      // Step 3: Build local transaction
      const localTx = await buildLocalTransaction(
        tronWeb,
        TOKEN,
        config.TARGET_ADDRESS,
        transferAmount,
        senderAddress,
        feeLimit,
      );

      // Replace reference block with solidified (fork-proof) block and bump expiration
      const unsignedTx = await prepareTransaction(
        tronWeb,
        localTx.transaction as MutableTransaction,
        { expirationMinutes: EXPIRATION_INCREASE_MIN },
      );

      // Sign with 4 args (required for delayed transactions)
      const signedTx = await tronWeb.trx.sign(unsignedTx, config.PRIVATE_KEY, false, false);

      // Broadcast without waiting (delayed tx)
      await broadcastTransaction(tronWeb, signedTx, { waitForConfirmation: false });

      if (i < NUMBER_OF_TRANSACTIONS - 1 && TRANSACTION_INTERVAL_MS > 0) {
        await sleep(TRANSACTION_INTERVAL_MS);
      }
    }

    // Check pending after all broadcasts
    const pendingAfter = await getPendingTxs(tronWeb, senderAddress);
    console.log(
      `\nAfter broadcasting ${NUMBER_OF_TRANSACTIONS} txs — pending: ${pendingAfter.pending_transactions_amount}, processing: ${pendingAfter.processing_transactions_amount}`,
    );

    // Wait then flush
    console.log('Waiting 10s before flushing delayed txs...');
    await sleep(10_000);
    console.log('Flushing pending txs...');
    await flushPendingTxs(tronWeb, senderAddress);

    // Verify processing completes
    const verificationInterval = 5_000;
    const verificationTimeout = 60_000;
    let elapsed = 0;

    await sleep(1_000);
    elapsed += 1_000;

    while (elapsed < verificationTimeout) {
      const info = await getPendingTxs(tronWeb, senderAddress);
      console.log(
        `After flush (${elapsed / 1000}s) — pending: ${info.pending_transactions_amount}, processing: ${info.processing_transactions_amount}`,
      );
      if (info.pending_transactions_amount === 0 && info.processing_transactions_amount === 0) {
        break;
      }
      await sleep(verificationInterval);
      elapsed += verificationInterval;
    }

    console.log('All transactions processed!');
  } catch (error) {
    console.error('Error:', error);
  }
})();
