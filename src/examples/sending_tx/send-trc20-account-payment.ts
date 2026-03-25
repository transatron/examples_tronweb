/**
 * Send TRC20 — ACCOUNT_PAYMENT mode.
 * Broadcasts N transactions with fees deducted from company's prepaid TFN/TFU balance (cheapest mode).
 * Uses spender API key.
 *
 * Transactions are created and broadcast with a fixed delay (no waiting for confirmation).
 * Statuses are checked after all transactions have been fired.
 */
import { config } from '../../config/env.js';
import { TOKENS } from '../../config/tokens.js';
import { createSpenderTronWeb } from '../../lib/tronweb-factory.js';
import { formatSun, hexToUnicode, isObjectEmpty } from '../../lib/format.js';
import { estimateFeeLimit, simulateTransaction, buildLocalTransaction } from '../../lib/trc20.js';
import { broadcastTransaction } from '../../lib/broadcast.js';
import { sleep } from '../../lib/sleep.js';

const TOKEN = TOKENS.USDT;
const NUMBER_OF_TRANSACTIONS = 5;
const TRANSACTION_INTERVAL_MS = 800;

(async () => {
  try {
    const tronWeb = createSpenderTronWeb();
    const senderAddress = tronWeb.defaultAddress.base58 as string;

    console.log('=== Send TRC20 — Account Payment ===');
    console.log('Sender:', senderAddress);
    console.log('Target:', config.TARGET_ADDRESS);
    console.log('Token:', TOKEN);
    console.log('Number of transactions:', NUMBER_OF_TRANSACTIONS);

    const txIds: string[] = [];

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

      // Step 2: Simulate to get fee quotes
      const txWrap = await simulateTransaction(
        tronWeb,
        TOKEN,
        config.TARGET_ADDRESS,
        transferAmount,
        senderAddress,
        feeLimit,
      );

      const tt = txWrap.transatron;
      console.log('Transatron code:', tt.code, 'message:', hexToUnicode(tt.message));
      console.log(
        'Account fees:',
        formatSun(tt.tx_fee_rtrx_account),
        'TFN /',
        formatSun(tt.tx_fee_rusdt_account),
        'TFU',
      );
      console.log(
        'Balance:',
        formatSun(tt.user_account_balance_rtrx),
        'TFN,',
        formatSun(tt.user_account_balance_rusdt),
        'TFU',
      );

      // Step 3: Build local, sign, broadcast (fire-and-forget)
      const localTx = await buildLocalTransaction(
        tronWeb,
        TOKEN,
        config.TARGET_ADDRESS,
        transferAmount,
        senderAddress,
        feeLimit,
      );

      const signedTx = await tronWeb.trx.sign(localTx.transaction, config.PRIVATE_KEY);
      txIds.push(signedTx.txID);

      // Fire broadcast without awaiting the HTTP response — the 800ms delay
      // is the only pacing between sends. Awaiting sendRawTransaction would
      // block on TransaTron's queue processing and defeat the fixed interval.
      broadcastTransaction(tronWeb, signedTx, { waitForConfirmation: false }).then(
        (res) => console.log(`  [async] ${signedTx.txID} broadcast done, code: ${res.transatron?.code ?? res.code ?? 'ok'}`),
        (err) => console.error(`  [async] ${signedTx.txID} broadcast error:`, err),
      );

      if (i < NUMBER_OF_TRANSACTIONS - 1 && TRANSACTION_INTERVAL_MS > 0) {
        await sleep(TRANSACTION_INTERVAL_MS);
      }
    }

    // Wait for TransaTron queue processing, then check all statuses
    console.log('\n=== All transactions broadcasted. Waiting 10s for confirmations... ===');
    await sleep(10_000);

    const RETRY_INTERVAL_MS = 5_000;
    const MAX_RETRIES = 10;
    let pending = new Set(txIds);

    for (let attempt = 0; pending.size > 0 && attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        console.log(`\nRetry ${attempt}/${MAX_RETRIES} — ${pending.size} tx(s) still pending, waiting ${RETRY_INTERVAL_MS / 1000}s...`);
        await sleep(RETRY_INTERVAL_MS);
      }

      console.log(`\n=== Transaction Statuses${attempt > 0 ? ` (attempt ${attempt + 1})` : ''} ===`);
      for (const txId of txIds) {
        const txReceipt = await tronWeb.trx.getTransaction(txId).catch(() => null);
        const txInfo = await tronWeb.trx.getTransactionInfo(txId).catch(() => null);

        const contractRet = isObjectEmpty(txReceipt)
          ? 'NOT_FOUND'
          : (txReceipt as { ret: { contractRet: string }[] }).ret[0].contractRet;

        const info = txInfo as { receipt?: { result?: string; net_usage?: number } } | null;
        const netUsage = info?.receipt?.net_usage ?? 0;

        const isPending = contractRet === 'NOT_FOUND' || (contractRet === 'SUCCESS' && netUsage === 0);
        const status = isPending ? 'PENDING' : contractRet;

        console.log(`${txId} => ${status} (contractRet: ${contractRet}, net_usage: ${netUsage})`);

        if (status !== 'PROCESSING' && status !== 'PENDING') {
          pending.delete(txId);
        }
      }
    }

    if (pending.size > 0) {
      console.log(`\n${pending.size} transaction(s) still not confirmed after all retries.`);
    }

    console.log('\nDone!');
  } catch (error) {
    console.error('Error:', error);
  }
})();
