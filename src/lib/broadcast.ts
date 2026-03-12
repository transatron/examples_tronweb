import type { TronWeb, Types } from 'tronweb';
import { hexToUnicode, isObjectEmpty } from './format.js';
import { sleep } from './sleep.js';
import type { TransatronBroadcastResult } from '../types/index.js';

export interface BroadcastOptions {
  waitForConfirmation?: boolean;
  verbose?: boolean;
}

/**
 * Broadcast a signed transaction through TransaTron and optionally poll until confirmed.
 * Uses 50s initial wait then 5s retries (TransaTron queue processing time).
 */
export async function broadcastTransaction(
  tronWeb: TronWeb,
  signedTransaction: Types.SignedTransaction,
  options: BroadcastOptions = {},
): Promise<TransatronBroadcastResult> {
  const { waitForConfirmation = true, verbose = false } = options;

  if (waitForConfirmation) {
    console.log(`Broadcasting tx ${signedTransaction.txID} and waiting until confirmed...`);
  } else {
    console.log(`Broadcasting tx ${signedTransaction.txID} without waiting for confirmation...`);
  }

  const broadcastResult = (await tronWeb.trx
    .sendRawTransaction(signedTransaction)
    .catch((err) => console.error(err))) as unknown as TransatronBroadcastResult;

  if (verbose) {
    console.log('broadcastResult =', broadcastResult);
  }

  const ttCode = broadcastResult.transatron?.code;
  console.log(`Transaction ${signedTransaction.txID} broadcasted. Transatron code: ${ttCode}`);

  if (ttCode === 'PENDING') {
    console.log('Delayed transaction sent. Please check txHash =', broadcastResult.txid, 'later!');
    return broadcastResult;
  }

  const message = broadcastResult.transatron?.message;
  if (message) {
    const decoded = hexToUnicode(message);
    if (verbose) console.log('Transatron message:', decoded);
  }

  if (broadcastResult.code === 'CONTRACT_VALIDATE_ERROR') {
    console.log(
      'Error: CONTRACT_VALIDATE_ERROR, message =',
      hexToUnicode(broadcastResult.message),
      'txHash =',
      broadcastResult.txid,
    );
    return broadcastResult;
  }

  const txID = broadcastResult.txid;

  if (waitForConfirmation) {
    let txMined = false;
    let waitedTime = 0;

    do {
      const txReceipt1 = await tronWeb.trx.getTransaction(txID).catch((err) => console.error(err));
      if (verbose) {
        console.log('txReceipt1:', txReceipt1);
      }
      const state1 = isObjectEmpty(txReceipt1)
        ? ''
        : (txReceipt1 as { ret: { contractRet: string }[] }).ret[0].contractRet;

      const txReceipt2 = await tronWeb.trx
        .getTransactionInfo(txID)
        .catch((err) => console.error(err));
      if (verbose) {
        console.log('txReceipt2:', txReceipt2);
      }

      if (state1 === 'OUT_OF_ENERGY') {
        console.log('Error: OUT_OF_ENERGY, txHash =', signedTransaction.txID);
        break;
      }

      if (state1 === 'REVERT') {
        console.log('Error: REVERT, txHash =', signedTransaction.txID);
        break;
      }

      const receipt = txReceipt2 as { receipt?: { net_usage?: number; net_fee?: number } } | undefined;
      const state2 = isObjectEmpty(txReceipt2)
        ? false
        : (receipt?.receipt?.net_usage ?? 0) > 0 || (receipt?.receipt?.net_fee ?? 0) > 0;
      txMined =
        !isObjectEmpty(txReceipt1) && !isObjectEmpty(txReceipt2) && state1 === 'SUCCESS' && state2;

      if (!txMined) {
        console.log('txMined =', txMined, 'Waiting... / state1', state1, 'state2', state2);
        const timeout = waitedTime === 0 ? 5000 : 3000;
        waitedTime += timeout;
        await sleep(timeout);
      }
    } while (!txMined);

    console.log('Transaction mined');
  }

  return broadcastResult;
}
