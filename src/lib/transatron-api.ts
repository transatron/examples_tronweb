import type { TronWeb } from 'tronweb';
import type {
  CouponCreateRequest,
  CouponCreateResponse,
  CouponGetResponse,
  AccountingConfig,
  OrdersResponse,
  PendingTxsInfo,
} from '../types/index.js';

/** Create a coupon (requires spender API key). */
export async function createCoupon(
  tronWeb: TronWeb,
  request: CouponCreateRequest,
): Promise<CouponCreateResponse> {
  return tronWeb.fullNode.request<CouponCreateResponse>('api/v1/coupon', request, 'post');
}

/** Get coupon details by ID (requires spender API key). */
export async function getCoupon(tronWeb: TronWeb, couponId: string): Promise<CouponGetResponse> {
  return tronWeb.fullNode.request<CouponGetResponse>(`api/v1/coupon/${couponId}`, {}, 'get');
}

/** Delete a coupon by ID (requires spender API key). */
export async function deleteCoupon(
  tronWeb: TronWeb,
  couponId: string,
): Promise<{ code: string }> {
  return tronWeb.fullNode.request<{ code: string }>(`api/v1/coupon/${couponId}`, {}, 'delete');
}

/** Get pending transaction info for an address. */
export async function getPendingTxs(tronWeb: TronWeb, address: string): Promise<PendingTxsInfo> {
  return tronWeb.fullNode.request<PendingTxsInfo>('api/v1/pendingtxs', { address }, 'post');
}

/** Flush (trigger processing of) pending transactions for an address. */
export async function flushPendingTxs(
  tronWeb: TronWeb,
  address: string,
): Promise<unknown> {
  return tronWeb.fullNode.request('api/v1/pendingtxs/flush', { address }, 'post');
}

/** Get TransaTron accounting config (includes payment_address). */
export async function getAccountingConfig(tronWeb: TronWeb): Promise<AccountingConfig> {
  return tronWeb.fullNode.request<AccountingConfig>('api/v1/config', {}, 'get');
}

/** Get orders from TransaTron API. */
export async function getOrders(tronWeb: TronWeb): Promise<OrdersResponse> {
  return tronWeb.fullNode.request<OrdersResponse>('api/v1/orders', {}, 'get');
}
