import type { TronWeb, Types } from 'tronweb';
import type { TransatronTransactionWrapper } from '../types/index.js';

/**
 * SunSwap Smart Exchange Router: swapExactInput
 *
 * Contract: TWH7FMNjaLUfx5XnCzs1wybzA6jV5DXWsG
 * Source: https://github.com/sun-protocol/smart-exchange-router
 *
 * Solidity signature:
 *   struct SwapData { uint256 amountIn; uint256 amountOutMin; address to; uint256 deadline; }
 *   swapExactInput(address[], string[], uint256[], uint24[], SwapData)
 *
 * ABI canonical form:
 *   swapExactInput(address[],string[],uint256[],uint24[],(uint256,uint256,address,uint256))
 *   Method ID: cef95229
 *
 * The SwapData tuple is a static type — its 4 fields are encoded inline in the
 * head (not behind a dynamic offset). The head layout is:
 *   [offset_path][offset_poolVersion][offset_versionLen][offset_fees]
 *   [amountIn][amountOutMin][to][deadline]
 * followed by the tail data for each dynamic array.
 *
 * versionLen[i] = number of path elements consumed by poolVersion[i].
 * For a 3-token path [A, B, C] with 2 versions ['v2','v3']:
 *   versionLen = [2, 1] means v2 handles [A,B], v3 handles [B,C].
 */

const SWAP_FUNCTION =
  'swapExactInput(address[],string[],uint256[],uint24[],(uint256,uint256,address,uint256))';
const SWAP_SELECTOR = 'cef95229';

/** ABI-encode a uint256 as 32-byte hex (no 0x prefix). */
function encodeUint256(value: bigint): string {
  return value.toString(16).padStart(64, '0');
}

/** ABI-encode an address (strip 41 prefix, pad to 32 bytes). */
function encodeAddress(tronWeb: TronWeb, address: string): string {
  const hex = tronWeb.address.toHex(address);
  // TRON hex addresses start with '41', strip it for ABI encoding
  const raw = hex.startsWith('41') ? hex.slice(2) : hex;
  return raw.padStart(64, '0');
}

/** ABI-encode a string as dynamic data (length, padded content). */
function encodeString(str: string): string {
  const hex = Buffer.from(str, 'utf8').toString('hex');
  const len = encodeUint256(BigInt(str.length));
  const padded = hex.padEnd(Math.ceil(hex.length / 64) * 64, '0');
  return len + padded;
}

export interface SwapParams {
  /** Array of token addresses in the swap path */
  path: string[];
  /** Pool versions, e.g. ['v2', 'v3'] */
  poolVersion: string[];
  /** Number of path elements each pool version consumes, e.g. [2, 1] */
  versionLen: bigint[];
  /** Pool fees — one per path element, e.g. [0, 500, 0] */
  fees: bigint[];
  /** Amount of input token (in smallest unit) */
  amountIn: bigint;
  /** Minimum output amount (slippage protection) */
  amountOutMin: bigint;
  /** Recipient address */
  recipient: string;
  /** Unix timestamp deadline */
  deadline: bigint;
}

/**
 * Manually ABI-encode the swapExactInput parameters (without selector).
 *
 * Head layout (8 words = 256 bytes):
 *   W0-W3: offsets for 4 dynamic arrays (path, poolVersion, versionLen, fees)
 *   W4-W7: inline SwapData tuple (amountIn, amountOutMin, to, deadline)
 * Tail: encoded dynamic arrays in order.
 */
function encodeSwapParams(tronWeb: TronWeb, params: SwapParams): string {
  // Head = 4 offsets + 4 tuple fields = 8 words = 256 bytes
  const headSize = 8 * 32;

  // Encode each dynamic parameter's tail data
  const pathData = encodeArray(params.path.map((addr) => encodeAddress(tronWeb, addr)));
  const poolVersionData = encodeDynamicStringArray(params.poolVersion);
  const versionLenData = encodeArray(params.versionLen.map((v) => encodeUint256(v)));
  const feesData = encodeArray(params.fees.map((f) => encodeUint256(f)));

  // Calculate offsets (relative to start of params encoding)
  let offset = headSize;
  const offset1 = offset;
  offset += pathData.length / 2;
  const offset2 = offset;
  offset += poolVersionData.length / 2;
  const offset3 = offset;
  offset += versionLenData.length / 2;
  const offset4 = offset;

  // Head: 4 dynamic offsets + 4 inline tuple fields
  const head =
    encodeUint256(BigInt(offset1)) +
    encodeUint256(BigInt(offset2)) +
    encodeUint256(BigInt(offset3)) +
    encodeUint256(BigInt(offset4)) +
    encodeUint256(params.amountIn) +
    encodeUint256(params.amountOutMin) +
    encodeAddress(tronWeb, params.recipient) +
    encodeUint256(params.deadline);

  return head + pathData + poolVersionData + versionLenData + feesData;
}

/** Encode a static array of 32-byte elements: length + elements */
function encodeArray(elements: string[]): string {
  let result = encodeUint256(BigInt(elements.length));
  for (const el of elements) {
    result += el;
  }
  return result;
}

/** Encode a dynamic array of strings: length + offsets + encoded strings */
function encodeDynamicStringArray(strings: string[]): string {
  const count = encodeUint256(BigInt(strings.length));

  // Each string is dynamic, so we need offsets
  const encodedStrings = strings.map((s) => encodeString(s));

  // Offsets start after count + offset slots
  const offsetBase = strings.length * 32;
  let currentOffset = offsetBase;
  let offsets = '';
  const data: string[] = [];

  for (const encoded of encodedStrings) {
    offsets += encodeUint256(BigInt(currentOffset));
    data.push(encoded);
    currentOffset += encoded.length / 2;
  }

  return count + offsets + data.join('');
}

interface TriggerConstantResult {
  energy_used?: number;
  constant_result?: string[];
  result?: { code?: string; message?: string };
}

/**
 * Estimate energy for a swap using triggerConstantContract.
 * Also checks if the call would succeed — throws if it would revert.
 */
export async function estimateSwapEnergy(
  tronWeb: TronWeb,
  routerAddress: string,
  params: SwapParams,
  ownerAddress: string,
  callValue: number,
): Promise<number> {
  const routerHex = tronWeb.address.toHex(routerAddress);
  const ownerHex = tronWeb.address.toHex(ownerAddress);
  const parameter = encodeSwapParams(tronWeb, params);

  const response = await tronWeb.fullNode.request<TriggerConstantResult>(
    'wallet/triggerconstantcontract',
    {
      owner_address: ownerHex,
      contract_address: routerHex,
      data: SWAP_SELECTOR + parameter,
      call_value: callValue,
    },
    'post',
  );

  // Check if the simulated call would revert
  if (response.result?.code && response.result.code !== 'SUCCESS') {
    const msg = response.result.message
      ? Buffer.from(response.result.message, 'hex').toString('utf8')
      : response.result.code;
    throw new Error(`triggerConstantContract failed: ${msg}`);
  }

  return response.energy_used ?? 0;
}

/**
 * Simulate a swap transaction with txLocal: true to get TransaTron fee quotes.
 * Uses function_selector + parameter format required by triggersmartcontract.
 */
export async function simulateSwapTransaction(
  tronWeb: TronWeb,
  routerAddress: string,
  params: SwapParams,
  ownerAddress: string,
  feeLimit: number,
  callValue: number,
): Promise<TransatronTransactionWrapper> {
  const routerHex = tronWeb.address.toHex(routerAddress);
  const ownerHex = tronWeb.address.toHex(ownerAddress);
  const parameter = encodeSwapParams(tronWeb, params);

  try {
    return await tronWeb.fullNode.request<TransatronTransactionWrapper>(
      'wallet/triggersmartcontract',
      {
        owner_address: ownerHex,
        contract_address: routerHex,
        function_selector: SWAP_FUNCTION,
        parameter,
        call_value: callValue,
        fee_limit: feeLimit,
        txLocal: true,
      },
      'post',
    );
  } catch (error) {
    console.error('simulateSwapTransaction failed (triggersmartcontract):', error);
    throw error;
  }
}

/**
 * Build a swap transaction locally for signing.
 * Uses function_selector + parameter format required by triggersmartcontract.
 */
export async function buildLocalSwapTransaction(
  tronWeb: TronWeb,
  routerAddress: string,
  params: SwapParams,
  ownerAddress: string,
  feeLimit: number,
  callValue: number,
): Promise<Types.TransactionWrapper> {
  const routerHex = tronWeb.address.toHex(routerAddress);
  const ownerHex = tronWeb.address.toHex(ownerAddress);
  const parameter = encodeSwapParams(tronWeb, params);

  try {
    return await tronWeb.fullNode.request<Types.TransactionWrapper>(
      'wallet/triggersmartcontract',
      {
        owner_address: ownerHex,
        contract_address: routerHex,
        function_selector: SWAP_FUNCTION,
        parameter,
        call_value: callValue,
        fee_limit: feeLimit,
        txLocal: true,
      },
      'post',
    );
  } catch (error) {
    console.error('buildLocalSwapTransaction failed (triggersmartcontract):', error);
    throw error;
  }
}
