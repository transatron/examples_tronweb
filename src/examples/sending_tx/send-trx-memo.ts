/**
 * Send TRX with a memo attached.
 * Uses spender key (company account payment mode).
 *
 * The memo is written to the transaction's raw_data.data field via
 * transactionBuilder.addUpdateData(). On a sponsored transaction, TransferEdge
 * covers the TRON network's 1 TRX memo fee automatically — no extra funds or
 * steps needed by the sender.
 */
import { config } from '../../config/env.js';
import { createSpenderTronWeb } from '../../lib/tronweb-factory.js';
import { prepareTransaction } from '../../lib/tx-prepare.js';
import { broadcastTransaction } from '../../lib/broadcast.js';
import type { MutableTransaction } from '../../types/index.js';

const amountSun = Math.floor(Math.random() * 10_000) + 1;
const MEMO = 'TransferEdge memo example';

(async () => {
  try {
    const tronWeb = createSpenderTronWeb();
    const senderAddress = tronWeb.defaultAddress.base58 as string;

    console.log('=== Send TRX with Memo ===');
    console.log('Sender:', senderAddress);
    console.log('Target:', config.TARGET_ADDRESS);
    console.log('Amount:', amountSun, 'SUN');
    console.log('Memo:', MEMO);

    const rawTx = await tronWeb.transactionBuilder.sendTrx(
      config.TARGET_ADDRESS,
      amountSun,
      senderAddress,
    );

    // Attach the memo — the 1 TRX memo fee is covered automatically by TransferEdge
    const txWithMemo = await tronWeb.transactionBuilder.addUpdateData(
      rawTx as MutableTransaction,
      MEMO,
      'utf8',
      { txLocal: true }, // attach locally; do not round-trip the memo through the proxy (matches the proven Tester-RPC path)
    );

    // Replace reference block with solidified (fork-proof) block
    const unsignedTx = await prepareTransaction(tronWeb, txWithMemo);
    const signedTx = await tronWeb.trx.sign(unsignedTx);
    await broadcastTransaction(tronWeb, signedTx, { waitForConfirmation: true });

    console.log('Done.');
  } catch (error) {
    console.error('Error:', error);
  }
})();
