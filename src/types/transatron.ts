import type { Types } from 'tronweb';

/** Fee quote fields returned by TransaTron on simulate (txLocal: true) responses. */
export interface TransatronFeeQuote {
  code: string;
  message: string;
  tx_fee_rtrx_account: number;
  tx_fee_rusdt_account: number;
  tx_fee_rtrx_instant: number;
  tx_fee_rusdt_instant: number;
  user_account_balance_rtrx: number;
  user_account_balance_rusdt: number;
  tx_fee_burn_trx: number;
}

/** TransactionWrapper enriched with TransaTron fee quote. */
export interface TransatronTransactionWrapper extends Types.TransactionWrapper {
  transatron: TransatronFeeQuote;
}

/** Fields TransaTron adds to a broadcast result. */
export interface TransatronBroadcastExtra {
  code: string;
  message: string;
  tx_fee_burn_trx: number;
}

/** Broadcast result with TransaTron extension. */
export interface TransatronBroadcastResult {
  result: boolean;
  txid: string;
  code?: string;
  message?: string;
  transaction: Types.SignedTransaction;
  transatron?: TransatronBroadcastExtra;
}

/** TransaTron extension fields on getNodeInfo(). */
export interface TransatronNodeInfoExtension {
  deposit_address: string;
  rtrx_token_address: string;
  rusdt_token_address: string;
  rusdt_min_deposit: number;
  rtrx_min_deposit: number;
  trx_price: number;
}

/** getNodeInfo() return with optional transatronInfo. */
export interface TransatronNodeInfo {
  beginSyncNum: number;
  block: string;
  solidityBlock: string;
  currentConnectCount: number;
  activeConnectCount: number;
  passiveConnectCount: number;
  totalFlow: number;
  peerInfoList: unknown[];
  configNodeInfo: unknown;
  machineInfo: unknown;
  cheatWitnessInfoMap: unknown;
  transatronInfo?: TransatronNodeInfoExtension;
}

/** A signed transaction with an optional coupon field for coupon payment. */
export interface SignedTransactionWithCoupon extends Types.SignedTransaction {
  coupon?: string;
}

/** Pending transactions info returned by api/v1/pendingtxs. */
export interface PendingTxsInfo {
  pending_transactions_amount: number;
  processing_transactions_amount: number;
}

/** Transaction that can be modified (e.g. for delayed tx expiration bump). */
export type MutableTransaction = Types.Transaction & {
  raw_data: Types.Transaction['raw_data'] & { expiration: number };
};
