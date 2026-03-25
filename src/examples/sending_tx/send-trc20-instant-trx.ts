/**
 * Send TRC20 — INSTANT_PAYMENT_TRX mode.
 * Fee is paid instantly by sending TRX to TransaTron's deposit address.
 * Uses non-spender API key.
 */
import { config } from '../../config/env.js';
import { TOKENS } from '../../config/tokens.js';
import { createNonSpenderTronWeb } from '../../lib/tronweb-factory.js';
import { formatSun } from '../../lib/format.js';
import { getTransatronNodeInfo } from '../../lib/chain-info.js';
import { estimateFeeLimit, simulateTransaction, buildLocalTransaction } from '../../lib/trc20.js';
import { prepareTransaction } from '../../lib/tx-prepare.js';
import { broadcastTransaction } from '../../lib/broadcast.js';
import type { MutableTransaction } from '../../types/index.js';

const TOKEN = TOKENS.USDT;

(async () => {
  try {
    const tronWeb = createNonSpenderTronWeb();
    const senderAddress = tronWeb.defaultAddress.base58 as string;
    const transferAmount = Math.floor(Math.random() * 10000) + 5000;

    console.log('=== Send TRC20 — Instant TRX Payment ===');
    console.log('Sender:', senderAddress);
    console.log('Amount:', transferAmount);

    const nodeInfo = await getTransatronNodeInfo(tronWeb);
    if (!nodeInfo) throw new Error('TransaTron node info not available');

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

    const tt = txWrap.transatron;
    console.log('Instant TRX fee:', formatSun(tt.tx_fee_rtrx_instant), 'TRX');

    //Step 3.
    // Create and sign TRX Fee transaction to deposit address
    const rawFeeTx = await tronWeb.transactionBuilder.sendTrx(
      nodeInfo.deposit_address,
      tt.tx_fee_rtrx_instant,
      senderAddress,
    );
    // Replace reference block with solidified (fork-proof) block
    const feeTx = await prepareTransaction(tronWeb, rawFeeTx as MutableTransaction);
    const signedFeeTx = await tronWeb.trx.sign(feeTx);
    // Step 4: Build main transaction, sign
    const mainTx = await buildLocalTransaction(
      tronWeb,
      TOKEN,
      config.TARGET_ADDRESS,
      transferAmount,
      senderAddress,
      feeLimit,
    );

    // Replace reference block with solidified (fork-proof) block
    const unsignedMainTx = await prepareTransaction(tronWeb, mainTx.transaction as MutableTransaction);
    const signedTx = await tronWeb.trx.sign(unsignedMainTx, config.PRIVATE_KEY);
    // Step 5: Broadcast fee transaction
    const feeResult = await tronWeb.trx.sendRawTransaction(signedFeeTx).catch(console.error);
    if (feeResult && typeof feeResult === 'object' && 'result' in feeResult && feeResult.result) {
      console.log('Fee payment broadcasted OK, txid:', (feeResult as { txid: string }).txid);
      // Step 6: Broadcast main transaction
      await broadcastTransaction(tronWeb, signedTx, { waitForConfirmation: true });
    } else {
      console.error('Fee payment failed:', feeResult);
    }
    

    console.log('Done.');
  } catch (error) {
    console.error('Error:', error);
  }
})();
