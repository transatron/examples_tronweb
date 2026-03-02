/**
 * TRX balance replenisher for TransaTron account.
 * Checks TFN balance against a threshold and deposits TRX if below.
 * Uses spender API key.
 */
import { formatSun } from '../lib/format.js';
import { createSpenderTronWeb } from '../lib/tronweb-factory.js';
import { getTransatronNodeInfo } from '../lib/chain-info.js';
import { getAccountingConfig } from '../lib/transatron-api.js';
import { broadcastTransaction } from '../lib/broadcast.js';
import { sleep } from '../lib/sleep.js';

const THRESHOLD_SUN = 300_000_000; // 300 TRX — replenish when balance drops below this
const TOP_UP_SUN = 30_000_000; //  30 TRX — amount to deposit

(async () => {
  try {
    const tronWeb = createSpenderTronWeb();
    const senderAddress = tronWeb.defaultAddress.base58 as string;

    console.log('=== Replenish TRX ===');
    console.log('Sender:', senderAddress);
    console.log('Threshold:', formatSun(THRESHOLD_SUN), 'TFN');
    console.log('Top-up amount:', formatSun(TOP_UP_SUN), 'TRX');

    // Check current TFN balance
    const accountingConfig = await getAccountingConfig(tronWeb);
    const balanceBefore = accountingConfig.balance_rtrx;
    console.log('TFN balance:', formatSun(balanceBefore), 'TFN');

    if (balanceBefore >= THRESHOLD_SUN) {
      console.log('Balance is above threshold — no replenishment needed.');
      return;
    }

    console.log('Balance is below threshold — depositing TRX...');

    // Get deposit address and min deposit amount
    const depositAddress = accountingConfig.payment_address;
    const nodeInfo = await getTransatronNodeInfo(tronWeb);
    if (!nodeInfo) throw new Error('TransaTron node info not available');

    const depositAmount = Math.max(TOP_UP_SUN, nodeInfo.rtrx_min_deposit);

    console.log('Deposit address:', depositAddress);
    console.log('Min deposit:', formatSun(nodeInfo.rtrx_min_deposit), 'TRX');
    console.log('Deposit amount:', formatSun(depositAmount), 'TRX');

    // Check wallet TRX balance
    const walletBalance = await tronWeb.trx.getBalance(senderAddress);
    console.log('Wallet TRX balance:', formatSun(walletBalance), 'TRX');
    if (walletBalance < depositAmount) {
      throw new Error(
        `Insufficient TRX balance: ${formatSun(walletBalance)} TRX, need at least ${formatSun(depositAmount)} TRX`,
      );
    }

    // Send TRX to deposit address
    const unsignedTx = await tronWeb.transactionBuilder.sendTrx(
      depositAddress,
      depositAmount,
      senderAddress,
    );
    const signedTx = await tronWeb.trx.sign(unsignedTx);
    await broadcastTransaction(tronWeb, signedTx, { waitForConfirmation: true });

    // Verify TFN credit
    console.log('Waiting 10s for deposit to be credited...');
    await sleep(10_000);
    const configAfter = await getAccountingConfig(tronWeb);
    const balanceAfter = configAfter.balance_rtrx;

    console.log('TFN balance before:', formatSun(balanceBefore), 'TFN');
    console.log('TFN balance after:', formatSun(balanceAfter), 'TFN');
    console.log('Delta:', formatSun(balanceAfter - balanceBefore), 'TFN');

    console.log('Done.');
  } catch (error) {
    console.error('Error:', error);
  }
})();
