/** Request body for creating a coupon via api/v1/coupon. */
export interface CouponCreateRequest {
  rtrx_limit: number;
  usdt_transactions: number;
  address: string;
  valid_to: number;
}

/** Single coupon detail. */
export interface CouponDetail {
  id: string;
  rtrx_limit: number;
  usdt_transactions?: number;
  address: string;
  valid_to: number;
  rtrx_spent?: number;
  tx_id?: string;
}

/** Response from GET api/v1/coupon/:id. */
export interface CouponGetResponse {
  code: string;
  coupon: CouponDetail;
  balance_rtrx: number;
  balance_rusdt: number;
  balance_on_coupons_rtrx: number;
}

/** Response from creating a coupon. */
export interface CouponCreateResponse {
  code: string;
  coupon: CouponDetail;
  balance_rtrx: number;
  balance_rusdt: number;
  balance_on_coupons_rtrx: number;
}
