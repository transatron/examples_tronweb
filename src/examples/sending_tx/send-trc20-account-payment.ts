/**
 * Send TRC20 — ACCOUNT_PAYMENT mode.
 * Broadcasts N transactions with fees deducted from company's prepaid TFN/TFU balance (cheapest mode).
 * Uses spender API key.
 */
import { config } from '../../config/env.js';
import { TOKENS } from '../../config/tokens.js';
import { createSpenderTronWeb } from '../../lib/tronweb-factory.js';
import { formatSun, hexToUnicode } from '../../lib/format.js';
import { estimateFeeLimit, simulateTransaction, buildLocalTransaction } from '../../lib/trc20.js';
import { broadcastTransaction } from '../../lib/broadcast.js';
import { sleep } from '../../lib/sleep.js';

const TOKEN = TOKENS.USDT;
const NUMBER_OF_TRANSACTIONS = 1;
const TRANSACTION_INTERVAL_MS = 1000;

(async () => {
  try {
    const tronWeb = createSpenderTronWeb();
    const senderAddress = tronWeb.defaultAddress.base58 as string;

    console.log('=== Send TRC20 — Account Payment ===');
    console.log('Sender:', senderAddress);
    console.log('Target:', config.TARGET_ADDRESS);
    console.log('Token:', TOKEN);
    console.log('Number of transactions:', NUMBER_OF_TRANSACTIONS);

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

      // Step 3: Build local, sign, broadcast
      const localTx = await buildLocalTransaction(
        tronWeb,
        TOKEN,
        config.TARGET_ADDRESS,
        transferAmount,
        senderAddress,
        feeLimit,
      );

      const signedTx = await tronWeb.trx.sign(localTx.transaction, config.PRIVATE_KEY);
      await broadcastTransaction(tronWeb, signedTx, { waitForConfirmation: true });

      if (i < NUMBER_OF_TRANSACTIONS - 1 && TRANSACTION_INTERVAL_MS > 0) {
        await sleep(TRANSACTION_INTERVAL_MS);
      }
    }

    console.log('\nAll transactions processed!');
  } catch (error) {
    console.error('Error:', error);
  }
})();
