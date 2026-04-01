/**
 * Business case: Read recipients/amounts from a CSV file, send delayed
 * transactions in batch, flush the queue, and verify all on-chain.
 *
 * Uses DELAYED_TRANSACTION mode (spender API key) — transactions are queued
 * with extended expiration and processed in batch, minimizing resource usage.
 * After all broadcasts, the queue is flushed and each transaction is verified.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config/env.js';
import { TOKENS } from '../config/tokens.js';
import { createSpenderTronWeb } from '../lib/tronweb-factory.js';
import { hexToUnicode } from '../lib/format.js';
import { estimateFeeLimit, simulateTransaction, buildLocalTransaction } from '../lib/trc20.js';
import { prepareTransaction } from '../lib/tx-prepare.js';
import { getPendingTxs, flushPendingTxs } from '../lib/transatron-api.js';
import { broadcastTransaction } from '../lib/broadcast.js';
import { sleep } from '../lib/sleep.js';
import type { MutableTransaction } from '../types/index.js';

const TOKEN = TOKENS.USDT;
const EXPIRATION_INCREASE_SEC = 3600; // 1 hour
const TRANSACTION_INTERVAL_MS = 2000;

// CSV file in the same directory as this script
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_FILE = path.join(__dirname, 'non-custodial-bulk-usdt-recipients.csv');

function parseCsv(filePath: string): { address: string; amount: number }[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  // Skip header row
  return lines.slice(1).map((line) => {
    const [address, amountStr] = line.trim().split(',');
    return { address, amount: Number(amountStr) };
  });
}

(async () => {
  try {
    // Step 1: Read recipients from CSV
    const recipients = parseCsv(CSV_FILE);
    console.log('=== Non-Custodial — Bulk USDT Payments (Delayed) ===');
    console.log('CSV file:', CSV_FILE);
    console.log('Recipients:', recipients.length);
    console.log('Expiration bump:', EXPIRATION_INCREASE_SEC, 'sec');
    console.log('');

    for (const r of recipients) {
      console.log(`  → ${r.address}: ${r.amount}`);
    }

    // Step 2: Create spender TronWeb
    const tronWeb = createSpenderTronWeb();
    const senderAddress = tronWeb.defaultAddress.base58 as string;
    console.log('\nSender:', senderAddress);

    // Check pending before starting
    const pendingBefore = await getPendingTxs(tronWeb, senderAddress);
    console.log(
      `Before — pending: ${pendingBefore.pending_transactions_amount}, processing: ${pendingBefore.processing_transactions_amount}`,
    );

    // Step 3: Loop through recipients, build and broadcast delayed transactions
    const results: { address: string; amount: number; txid: string }[] = [];

    for (let i = 0; i < recipients.length; i++) {
      const { address, amount } = recipients[i];
      console.log(`\n--- Recipient ${i + 1}/${recipients.length}: ${amount} to ${address} ---`);

      // Estimate feeLimit
      const { feeLimit } = await estimateFeeLimit(tronWeb, TOKEN, address, amount, senderAddress);

      // Simulate to get fee quote
      const txWrap = await simulateTransaction(tronWeb, TOKEN, address, amount, senderAddress, feeLimit);
      console.log(
        'Transatron code:',
        txWrap.transatron.code,
        'message:',
        hexToUnicode(txWrap.transatron.message),
      );

      // Build local transaction
      const localTx = await buildLocalTransaction(tronWeb, TOKEN, address, amount, senderAddress, feeLimit);

      // Replace reference block with solidified (fork-proof) block and bump expiration
      const unsignedTx = await prepareTransaction(
        tronWeb,
        localTx.transaction as MutableTransaction,
        { expirationSeconds: EXPIRATION_INCREASE_SEC },
      );

      // Sign with 4 args (required for delayed transactions)
      const signedTx = await tronWeb.trx.sign(unsignedTx, config.PRIVATE_KEY, false, false);

      // Broadcast without waiting (delayed tx goes to queue)
      const broadcastResult = await broadcastTransaction(tronWeb, signedTx, { waitForConfirmation: false });
      results.push({ address, amount, txid: broadcastResult.txid });

      if (i < recipients.length - 1 && TRANSACTION_INTERVAL_MS > 0) {
        await sleep(TRANSACTION_INTERVAL_MS);
      }
    }

    // Step 4: Check pending after all broadcasts
    const pendingAfter = await getPendingTxs(tronWeb, senderAddress);
    console.log(
      `\nAfter broadcasting ${recipients.length} txs — pending: ${pendingAfter.pending_transactions_amount}, processing: ${pendingAfter.processing_transactions_amount}`,
    );

    // Step 5: Flush the queue
    console.log('Waiting 5s before flushing delayed txs (this is just for test, not actually required in real life)...');
    await sleep(5_000);
    console.log('Flushing pending txs...');
    await flushPendingTxs(tronWeb, senderAddress);

    // Step 6: Poll each transaction via getTransactionById until all reach on-chain status.
    // TransaTron returns contractRet = 'PENDING' or 'PROCESSING' while the tx is in the queue.
    // Once processed and on-chain, the standard TRON response is returned (e.g. contractRet = 'SUCCESS').
    console.log('\n=== Waiting for all transactions to be processed on-chain ===');

    const POLL_INTERVAL_MS = 5_000;
    const POLL_TIMEOUT_MS = 120_000;
    const txStatuses: string[] = new Array(results.length).fill('PENDING');

    let pollElapsed = 0;
    while (pollElapsed < POLL_TIMEOUT_MS) {
      let allDone = true;

      for (let i = 0; i < results.length; i++) {
        if (txStatuses[i] !== 'PENDING' && txStatuses[i] !== 'PROCESSING') continue;

        try {
          const txData = (await tronWeb.trx.getTransaction(results[i].txid)) as {
            ret?: { contractRet: string }[];
          };
          const contractRet = txData?.ret?.[0]?.contractRet ?? 'PENDING';
          txStatuses[i] = contractRet;
        } catch {
          txStatuses[i] = 'NOT_FOUND';
        }

        // Still in TransaTron queue — keep polling
        if (txStatuses[i] === 'PENDING' || txStatuses[i] === 'PROCESSING') {
          allDone = false;
        }
      }

      console.log(
        `Poll (${pollElapsed / 1000}s) — statuses: [${txStatuses.join(', ')}]`,
      );

      if (allDone) break;
      await sleep(POLL_INTERVAL_MS);
      pollElapsed += POLL_INTERVAL_MS;
    }

    // Print final report
    console.log('\n=== Final Report ===');
    console.log('─'.repeat(110));
    console.log(
      `${'#'.padEnd(4)} ${'Address'.padEnd(36)} ${'Amount'.padEnd(10)} ${'Status'.padEnd(14)} TxID`,
    );
    console.log('─'.repeat(110));

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      console.log(
        `${String(i + 1).padEnd(4)} ${r.address.padEnd(36)} ${String(r.amount).padEnd(10)} ${txStatuses[i].padEnd(14)} ${r.txid}`,
      );
    }

    console.log('─'.repeat(110));
    console.log(`Total: ${results.length} payments processed.`);

    console.log('\nDone.');
  } catch (error) {
    console.error('Error:', error);
  }
})();
