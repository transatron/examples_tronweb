import type { TronWeb, Types } from 'tronweb';
import type { TransatronTransactionWrapper } from '../types/index.js';
import { getChainParams } from './chain-info.js';

const TRANSFER_FUNCTION = 'transfer(address,uint256)';
const APPROVE_FUNCTION = 'approve(address,uint256)';
const FALLBACK_ENERGY = 132_000; // max energy for a USDT transfer (unactivated address)
const APPROVE_FALLBACK_ENERGY = 100_000; // fallback energy for approve

/** Estimate energy for a TRC20 transfer using triggerConstantContract. */
export async function estimateEnergy(
  tronWeb: TronWeb,
  contractAddress: string,
  toAddress: string,
  amount: number,
  ownerAddress: string,
): Promise<number> {
  const contractHex = tronWeb.address.toHex(contractAddress);
  const ownerHex = tronWeb.address.toHex(ownerAddress);
  const params: Types.ContractFunctionParameter[] = [
    { type: 'address', value: toAddress },
    { type: 'uint256', value: amount },
  ];

  const response = await tronWeb.transactionBuilder.triggerConstantContract(
    contractHex,
    TRANSFER_FUNCTION,
    {},
    params,
    ownerHex,
  );

  return response.energy_used ?? 0;
}

/**
 * Estimate the feeLimit for a TRC20 transfer.
 * Calls triggerConstantContract for energy, multiplies by energyFee from chain params.
 * Falls back to 132_000 energy (max USDT transfer cost) if estimation fails
 * (e.g. unactivated sender or insufficient balance).
 */
export async function estimateFeeLimit(
  tronWeb: TronWeb,
  contractAddress: string,
  toAddress: string,
  amount: number,
  ownerAddress: string,
): Promise<{ feeLimit: number; energy: number; energyFee: number }> {
  const { energyFee } = await getChainParams(tronWeb);
  let energy: number;
  try {
    energy = await estimateEnergy(tronWeb, contractAddress, toAddress, amount, ownerAddress);
  } catch {
    energy = FALLBACK_ENERGY;
    console.log(`Energy estimation failed, using fallback: ${energy}`);
  }
  const feeLimit = energy * energyFee;
  console.log(`Estimated energy: ${energy}, energyFee: ${energyFee}, feeLimit: ${feeLimit} SUN`);
  return { feeLimit, energy, energyFee };
}

/**
 * Simulate a TRC20 transaction with txLocal: true to get TransaTron fee quotes.
 * Returns the full TransaTron-enriched transaction wrapper.
 */
export async function simulateTransaction(
  tronWeb: TronWeb,
  contractAddress: string,
  toAddress: string,
  amount: number,
  ownerAddress: string,
  feeLimit: number,
): Promise<TransatronTransactionWrapper> {
  const contractHex = tronWeb.address.toHex(contractAddress);
  const ownerHex = tronWeb.address.toHex(ownerAddress);
  const params: Types.ContractFunctionParameter[] = [
    { type: 'address', value: toAddress },
    { type: 'uint256', value: amount },
  ];

  const options = { feeLimit, callValue: 0, txLocal: true };

  const args = tronWeb.transactionBuilder._getTriggerSmartContractArgs(
    contractHex,
    TRANSFER_FUNCTION,
    options,
    params,
    ownerHex,
    0,
    '',
    options.callValue,
    options.feeLimit,
  );

  return tronWeb.fullNode.request<TransatronTransactionWrapper>(
    'wallet/triggersmartcontract',
    args,
    'post',
  );
}

/**
 * Build a TRC20 transaction locally (step 3 of 3-step flow).
 * Returns the unsigned transaction object ready for signing.
 */
export async function buildLocalTransaction(
  tronWeb: TronWeb,
  contractAddress: string,
  toAddress: string,
  amount: number,
  ownerAddress: string,
  feeLimit: number,
) {
  const contractHex = tronWeb.address.toHex(contractAddress);
  const ownerHex = tronWeb.address.toHex(ownerAddress);
  const params: Types.ContractFunctionParameter[] = [
    { type: 'address', value: toAddress },
    { type: 'uint256', value: amount },
  ];

  const options = { feeLimit, callValue: 0, txLocal: true };

  return tronWeb.transactionBuilder._triggerSmartContractLocal(
    contractHex,
    TRANSFER_FUNCTION,
    options,
    params,
    ownerHex,
  );
}

// ── Approve helpers ─────────────────────────────────────────────────────

/** Estimate feeLimit for a TRC20 approve call. */
export async function estimateApproveFeeLimit(
  tronWeb: TronWeb,
  contractAddress: string,
  spenderAddress: string,
  amount: number,
  ownerAddress: string,
): Promise<{ feeLimit: number; energy: number; energyFee: number }> {
  const { energyFee } = await getChainParams(tronWeb);
  let energy: number;
  try {
    const contractHex = tronWeb.address.toHex(contractAddress);
    const ownerHex = tronWeb.address.toHex(ownerAddress);
    const response = await tronWeb.transactionBuilder.triggerConstantContract(
      contractHex,
      APPROVE_FUNCTION,
      {},
      [
        { type: 'address', value: spenderAddress },
        { type: 'uint256', value: amount },
      ],
      ownerHex,
    );
    energy = response.energy_used ?? 0;
  } catch {
    energy = APPROVE_FALLBACK_ENERGY;
    console.log(`Approve energy estimation failed, using fallback: ${energy}`);
  }
  const feeLimit = energy * energyFee;
  console.log(`Approve energy: ${energy}, energyFee: ${energyFee}, feeLimit: ${feeLimit} SUN`);
  return { feeLimit, energy, energyFee };
}

/** Simulate a TRC20 approve with txLocal: true to get TransaTron fee quotes. */
export async function simulateApproveTransaction(
  tronWeb: TronWeb,
  contractAddress: string,
  spenderAddress: string,
  amount: number,
  ownerAddress: string,
  feeLimit: number,
): Promise<TransatronTransactionWrapper> {
  const contractHex = tronWeb.address.toHex(contractAddress);
  const ownerHex = tronWeb.address.toHex(ownerAddress);
  const params: Types.ContractFunctionParameter[] = [
    { type: 'address', value: spenderAddress },
    { type: 'uint256', value: amount },
  ];

  const options = { feeLimit, callValue: 0, txLocal: true };

  const args = tronWeb.transactionBuilder._getTriggerSmartContractArgs(
    contractHex,
    APPROVE_FUNCTION,
    options,
    params,
    ownerHex,
    0,
    '',
    options.callValue,
    options.feeLimit,
  );

  return tronWeb.fullNode.request<TransatronTransactionWrapper>(
    'wallet/triggersmartcontract',
    args,
    'post',
  );
}

/** Build a TRC20 approve transaction locally for signing. */
export async function buildLocalApproveTransaction(
  tronWeb: TronWeb,
  contractAddress: string,
  spenderAddress: string,
  amount: number,
  ownerAddress: string,
  feeLimit: number,
) {
  const contractHex = tronWeb.address.toHex(contractAddress);
  const ownerHex = tronWeb.address.toHex(ownerAddress);
  const params: Types.ContractFunctionParameter[] = [
    { type: 'address', value: spenderAddress },
    { type: 'uint256', value: amount },
  ];

  const options = { feeLimit, callValue: 0, txLocal: true };

  return tronWeb.transactionBuilder._triggerSmartContractLocal(
    contractHex,
    APPROVE_FUNCTION,
    options,
    params,
    ownerHex,
  );
}

/**
 * Calculate estimated bandwidth needed for a transaction.
 * Based on raw_data_hex size + signature overhead.
 */
export function calculateBandwidth(rawDataHex: string): number {
  return (
    rawDataHex.length / 2 + // raw data size in bytes
    65 + // signature size (1 key)
    64 + // protocol overhead (from ApiWrapper.estimateBandwidth)
    5 // practical adjustment
  );
}
