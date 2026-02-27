/**
 * Deposit TRX to TransaTron account.
 * Gets deposit address from api/v1/config (payment_address), sends TRX, verifies TFN credit.
 * Uses spender API key.
 */
import { formatSun } from '../../lib/format.js';
import { createSpenderTronWeb } from '../../lib/tronweb-factory.js';
import { getTransatronNodeInfo } from '../../lib/chain-info.js';
import { getAccountingConfig } from '../../lib/transatron-api.js';
import { broadcastTransaction } from '../../lib/broadcast.js';
import { sleep } from '../../lib/sleep.js';

(async () => {
  try {
    const tronWeb = createSpenderTronWeb();
    const senderAddress = tronWeb.defaultAddress.base58 as string;

    console.log('=== Deposit TRX ===');
    console.log('Sender:', senderAddress);

    // Get deposit address and min deposit amount
    const accountingConfig = await getAccountingConfig(tronWeb);
    const depositAddress = accountingConfig.payment_address;

    const nodeInfo = await getTransatronNodeInfo(tronWeb);
    if (!nodeInfo) throw new Error('TransaTron node info not available');

    const depositAmount = nodeInfo.rtrx_min_deposit;

    console.log('Deposit address:', depositAddress);
    console.log('Min deposit:', formatSun(nodeInfo.rtrx_min_deposit), 'TRX');
    console.log('TFN balance before:', formatSun(accountingConfig.balance_rtrx), 'TFN');

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
    console.log('TFN balance after:', formatSun(configAfter.balance_rtrx), 'TFN');

    console.log('Done.');
  } catch (error) {
    console.error('Error:', error);
  }
})();
