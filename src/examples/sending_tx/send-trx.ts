/**
 * Send TRX — simplest transaction type.
 * Uses spender key (company account payment mode).
 */
import { config } from '../../config/env.js';
import { createSpenderTronWeb } from '../../lib/tronweb-factory.js';
import { prepareTransaction } from '../../lib/tx-prepare.js';
import { broadcastTransaction } from '../../lib/broadcast.js';
import type { MutableTransaction } from '../../types/index.js';

const amountSun = Math.floor(Math.random() * 10_000) + 1;

(async () => {
  try {
    const tronWeb = createSpenderTronWeb();
    const senderAddress = tronWeb.defaultAddress.base58 as string;

    console.log('=== Send TRX ===');
    console.log('Sender:', senderAddress);
    console.log('Target:', config.TARGET_ADDRESS);
    console.log('Amount:', amountSun, 'SUN');

    const rawTx = await tronWeb.transactionBuilder.sendTrx(
      config.TARGET_ADDRESS,
      amountSun,
      senderAddress,
    );

    // Replace reference block with solidified (fork-proof) block
    const unsignedTx = await prepareTransaction(tronWeb, rawTx as MutableTransaction);
    const signedTx = await tronWeb.trx.sign(unsignedTx);
    await broadcastTransaction(tronWeb, signedTx, { waitForConfirmation: true });

    console.log('Done.');
  } catch (error) {
    console.error('Error:', error);
  }
})();
