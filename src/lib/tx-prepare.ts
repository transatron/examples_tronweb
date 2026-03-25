/**
 * Transaction preparation helper — solidified reference block + expiration control.
 *
 * ## Why this exists
 *
 * Every TRON transaction includes a reference block (`ref_block_bytes` + `ref_block_hash`).
 * The node validates this via TAPOS (Transaction as Proof of Stake): it looks up the
 * referenced block in its RecentBlockStore (sliding window of 65,536 blocks ≈ 54 hours)
 * and compares the hash. If the block isn't found or the hash doesn't match → TAPOS_ERROR.
 *
 * TronWeb's default `getHeaderInfo()` fetches the **latest unconfirmed block** via
 * `wallet/getblock`. This block may be part of a micro-fork that gets discarded during
 * consensus. When that happens, the node's RecentBlockStore reverts the forked block
 * (it extends TronStoreWithRevoking), and the transaction's reference becomes invalid.
 *
 * ## The fix
 *
 * Use a **solidified** (irreversible) block as the reference. Solidified blocks have
 * already reached consensus and will never be reverted. They lag ~1-2 minutes behind
 * the chain tip, but that's well within the 65,536-block acceptance window.
 *
 * This helper also consolidates the expiration-bump pattern used by delayed transactions,
 * which was previously duplicated inline across example scripts.
 */
import type { TronWeb } from 'tronweb';
import type { MutableTransaction } from '../types/index.js';

/**
 * Which block to use as the transaction's TAPOS reference.
 *
 * - `'solidified'` — Latest irreversible block (`walletsolidity/getnowblock`).
 *   Immune to micro-forks. Recommended for all production use.
 * - `'latest'` — Latest block from the full node (`wallet/getnowblock`).
 *   Matches TronWeb's default behavior. Susceptible to TAPOS_ERROR if a
 *   micro-fork discards the referenced block before broadcast.
 */
export type RefBlockSource = 'solidified' | 'latest';

export interface PrepareOptions {
  /** Which block to reference. Default: `'solidified'`. */
  refBlock?: RefBlockSource;
  /** Transaction expiration in minutes from the reference block's timestamp. Default: 1. */
  expirationMinutes?: number;
}

/**
 * Replace a transaction's reference block and expiration, then recompute its ID.
 *
 * @example
 * // Delayed transaction: solidified block + 60min expiration
 * const unsignedTx = await prepareTransaction(tronWeb, localTx.transaction as MutableTransaction, {
 *   expirationMinutes: 60,
 * });
 *
 * @example
 * // Normal transaction: solidified block, default 1min expiration
 * const unsignedTx = await prepareTransaction(tronWeb, localTx.transaction as MutableTransaction);
 *
 * @example
 * // Explicitly use latest block (old TronWeb behavior)
 * const unsignedTx = await prepareTransaction(tronWeb, localTx.transaction as MutableTransaction, {
 *   refBlock: 'latest',
 * });
 */
export async function prepareTransaction(
  tronWeb: TronWeb,
  tx: MutableTransaction,
  options: PrepareOptions = {},
): Promise<MutableTransaction> {
  const { refBlock = 'solidified', expirationMinutes = 1 } = options;

  // Deep-copy to avoid mutating the caller's transaction object
  const prepared = JSON.parse(JSON.stringify(tx)) as MutableTransaction;

  // Fetch reference block
  const block =
    refBlock === 'solidified'
      ? await tronWeb.trx.getConfirmedCurrentBlock() // walletsolidity/getnowblock
      : await tronWeb.trx.getCurrentBlock(); // wallet/getnowblock

  const blockNumber = block.block_header.raw_data.number;
  const blockTimestamp = block.block_header.raw_data.timestamp;

  // ref_block_bytes: last 2 bytes of the block number (4 hex chars).
  // This is how TRON identifies which block slot to look up in RecentBlockStore.
  prepared.raw_data.ref_block_bytes = blockNumber.toString(16).slice(-4).padStart(4, '0');

  // ref_block_hash: bytes 8-16 of the blockID (chars 16-32 of the hex string).
  // The node compares this against the stored block hash at that slot.
  prepared.raw_data.ref_block_hash = block.blockID.slice(16, 32);

  // Timestamp and expiration are relative to the reference block.
  prepared.raw_data.timestamp = blockTimestamp;
  prepared.raw_data.expiration = blockTimestamp + expirationMinutes * 60 * 1000;

  // Recompute txID — raw_data changed, so the old ID is invalid.
  const updated = await tronWeb.transactionBuilder.newTxID(prepared);
  prepared.txID = updated.txID;
  prepared.raw_data = updated.raw_data;
  prepared.raw_data_hex = updated.raw_data_hex;
  prepared.visible = updated.visible;

  return prepared;
}
