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
