/** Response from api/v1/config endpoint. */
export interface AccountingConfig {
  payment_address: string;
  activation_price: number;
  active_coupons_count: number;
  balance_on_coupons_rtrx: number;
  balance_rtrx: number;
  balance_rusdt: number;
  bandwidth_price_per_unit: number;
  energy_price_per_unit: number;
  [key: string]: unknown;
}

/** Response from api/v1/orders endpoint. */
export interface OrdersResponse {
  orders: unknown[];
  [key: string]: unknown;
}

/** Response from api/v1/register endpoint. */
export interface RegisterResponse {
  deposit_address: string;
  activation_price: number;
  energy_price_per_unit: number;
  bandwidth_price_per_unit: number;
  balance_rtrx: number;
  balance_usdt: number;
  spender_api_key: string;
  non_spender_api_key: string;
  password: string;
}
