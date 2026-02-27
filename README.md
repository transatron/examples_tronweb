# TransaTron Integration Examples

Reference scripts demonstrating all [TransaTron](https://docs.transatron.io) fee payment modes and account management operations using [TronWeb](https://www.npmjs.com/package/tronweb) 6.x.

## Prerequisites

- Node.js >= 18
- TransaTron API keys (contact [TransaTron Support](https://t.me/TransaTronSupport) to obtain)
- A TRON wallet with TRX/USDT for testing

## Setup

```bash
npm install
```

Copy `.env.example` into `.env.stage` and/or `.env.prod` and fill in:

```
API="https://dev-api.transatron.app"           # or https://api.transatron.io for prod
PRIVATE_KEY="<wallet private key>"
TRANSATRON_API_KEY_NON_SPENDER="<non-spender API key>"
TRANSATRON_API_KEY_SPENDER="<spender API key>"
TARGET_ADDRESS="<recipient wallet address>"
```

**Spender vs Non-spender keys:** Spender keys are for server-side use — they have company-level privileges (prepaid balance, coupons, accounting). Non-spender keys are safe for client-side and mobile apps — for individual users paying fees per transaction. See [Accessing the Node](https://docs.transatron.io/transatron_node_api/accessing_tron_json_rpc/AccessingTheNode) for details.

## Running Examples

All scripts are available for both environments via npm scripts:

```bash
npm run <script-name>:stage   # uses .env.stage
npm run <script-name>:prod    # uses .env.prod
```

---

## Sending Transactions

Located in `src/examples/sending_tx/`. These scripts demonstrate the full lifecycle of sending TRX and TRC20 tokens through TransaTron using different fee payment modes. See the [Sending Transactions](https://docs.transatron.io/integration_guidelines/sending-transactions/SendingTransaction) integration guide for the general flow.

### How TRC20 Sends Work

All TRC20 examples follow a 3-step flow (see [TransaTron Extension Objects](https://docs.transatron.io/transatron_node_api/accessing_tron_json_rpc/TransatronExtensionObjects) for response format details):

1. **Estimate fee** — [`triggerConstantContract`](https://docs.transatron.io/transatron_node_api/accessing_tron_json_rpc/tron_api_extension/POST_TriggerSmartContract) to get energy estimate, then `fee_limit = energy_used * energy_fee`
2. **Simulate with `txLocal: true`** — TransaTron returns fee quotes in the `transatron` response object without broadcasting
3. **Build locally, sign, and broadcast** — transaction must go through TransaTron's node via [`broadcastTransaction`](https://docs.transatron.io/transatron_node_api/accessing_tron_json_rpc/tron_api_extension/POST_BroadcastTransaction) (resource delegation happens at broadcast time)

### send-trx

Send a native TRX transfer. Simplest transaction type — no fee estimation or simulation needed.

```bash
npm run send-trx:stage
npm run send-trx:prod
```

|              |                     |
| ------------ | ------------------- |
| **API key**  | Spender             |
| **Fee mode** | Account payment     |
| **Amount**   | Random < 10,000 SUN |

### send-trc20-account

Send TRC20 using **Account Payment** mode. Fees are deducted from the company's prepaid TFN/TFU balance — the cheapest mode with no extra on-chain transfer overhead. If the balance reaches 0, transactions are bypassed to TRON directly and will burn TRX for fees. Supports sending multiple transactions in a loop. See [Custody Integration](https://docs.transatron.io/integration_guidelines/custody/SendingTransactions) for details.

```bash
npm run send-trc20-account:stage
npm run send-trc20-account:prod
```

|                  |                                                              |
| ---------------- | ------------------------------------------------------------ |
| **API key**      | Spender                                                      |
| **Fee mode**     | Account payment (TFN/TFU balance)                            |
| **Configurable** | `NUMBER_OF_TRANSACTIONS`, `TRANSACTION_INTERVAL_MS`, `TOKEN` |

### send-trc20-instant-trx

Send TRC20 using **Instant Payment** mode with TRX. A separate TRX transfer to TransaTron's deposit address pays the fee before the main transaction is broadcast. TRX is cheaper than USDT for instant payments. See [Using Instant Payments](https://docs.transatron.io/integration_guidelines/non-custody/UsingInstantPayments) for the full 6-step flow.

```bash
npm run send-trc20-instant-trx:stage
npm run send-trc20-instant-trx:prod
```

|              |                                                       |
| ------------ | ----------------------------------------------------- |
| **API key**  | Non-spender                                           |
| **Fee mode** | Instant payment (TRX)                                 |
| **Flow**     | Build both txs → broadcast fee tx → broadcast main tx |

### send-trc20-instant-usdt

Send TRC20 using **Instant Payment** mode with USDT. Same as instant-trx but the fee is paid in USDT via a TRC20 transfer to the deposit address. See [Using Instant Payments](https://docs.transatron.io/integration_guidelines/non-custody/UsingInstantPayments).

```bash
npm run send-trc20-instant-usdt:stage
npm run send-trc20-instant-usdt:prod
```

|              |                                                       |
| ------------ | ----------------------------------------------------- |
| **API key**  | Non-spender                                           |
| **Fee mode** | Instant payment (USDT)                                |
| **Flow**     | Build both txs → broadcast fee tx → broadcast main tx |

### send-trc20-coupon

Send TRC20 using **Coupon Payment** mode. A coupon is a one-time, fee-limited code issued by the server using the Spender API key. The user redeems it by attaching the coupon ID to the signed transaction (non-spender key). Unused coupon balance is automatically returned to the company account. Particularly useful for non-custodial wallets that want to subsidize fees without handling user private keys. See [Using Coupons](https://docs.transatron.io/integration_guidelines/non-custody/UsingCoupons) and [Coupons API](https://docs.transatron.io/transatron_node_api/extended_api/coupons/About).

```bash
npm run send-trc20-coupon:stage
npm run send-trc20-coupon:prod
```

|              |                                                                     |
| ------------ | ------------------------------------------------------------------- |
| **API key**  | Spender (coupon creation) + Non-spender (redemption)                |
| **Fee mode** | Coupon payment                                                      |
| **Flow**     | Create coupon → build tx → attach coupon → broadcast → verify spent |

### send-trc20-delayed

Send TRC20 using **Delayed Transaction** mode. TransaTron stores transactions with extended expiration in an internal buffer and processes them in batches closer to the expiration time, minimizing resource usage and fees. After broadcasting N transactions, flushes the queue and polls until all are processed. Ideal for custody platforms handling withdrawals and consolidations. See [Delayed Transactions](https://docs.transatron.io/transatron_node_api/extended_api/delayed_transactions/About) and [Custody Integration](https://docs.transatron.io/integration_guidelines/custody/SendingTransactions).

```bash
npm run send-trc20-delayed:stage
npm run send-trc20-delayed:prod
```

|                  |                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| **API key**      | Spender                                                                                             |
| **Fee mode**     | Delayed transaction (batch queue)                                                                   |
| **Configurable** | `NUMBER_OF_TRANSACTIONS`, `TRANSACTION_INTERVAL_MS`, `EXPIRATION_INCREASE_MIN`                      |
| **Flow**         | Loop: build → bump expiration → sign(4 args) → broadcast → after loop: flush → poll until processed |

### estimate-fee

Estimate fees for a TRC20 transfer without sending. Shows energy estimate, all TransaTron fee quotes (account, instant TRX, instant USDT, burn), and current balance. Uses the [`transatron` extension object](https://docs.transatron.io/transatron_node_api/accessing_tron_json_rpc/TransatronExtensionObjects) returned by the simulate call.

```bash
npm run estimate-fee:stage
npm run estimate-fee:prod
```

---

## Accounting & Management

Located in `src/examples/accounting/`. These scripts handle account top-ups, balance checks, coupon lifecycle, and order queries via the TransaTron Extended API. See [Accounts & Balances](https://docs.transatron.io/integration_guidelines/accounts-balances) for an overview of TFN/TFU tokens and deposit flows.

### check-balances

Read TRX and TRC20 balances, chain parameters, and TransaTron [node info](https://docs.transatron.io/transatron_node_api/accessing_tron_json_rpc/tron_api_extension/GET_GetNodeInfo) (TFN/TFU balances, deposit address, min deposits, pricing).

```bash
npm run check-balances:stage
npm run check-balances:prod
```

### deposit-trx

Deposit TRX to fund the company's TransaTron account. Gets the deposit address from [`/api/v1/config`](https://docs.transatron.io/transatron_node_api/extended_api/accounting/GET_Config) (`payment_address`), checks wallet balance, sends the minimum deposit amount, and verifies the TFN credit.

```bash
npm run deposit-trx:stage
npm run deposit-trx:prod
```

### deposit-usdt

Deposit USDT to fund the company's TransaTron account. Same flow as deposit-trx but sends a TRC20 (USDT) transfer and verifies the TFU credit.

```bash
npm run deposit-usdt:stage
npm run deposit-usdt:prod
```

### coupon-mgmt

Full [coupon](https://docs.transatron.io/transatron_node_api/extended_api/coupons/About) lifecycle — [create](https://docs.transatron.io/transatron_node_api/extended_api/coupons/POST_Coupon), [read](https://docs.transatron.io/transatron_node_api/extended_api/coupons/GET_Coupon), and [delete](https://docs.transatron.io/transatron_node_api/extended_api/coupons/DELETE_Coupon) coupons. Shows coupon status (active/spent), limits, and balance impact.

```bash
npm run coupon-mgmt:stage
npm run coupon-mgmt:prod
```

### query-orders

Fetch [accounting config](https://docs.transatron.io/transatron_node_api/extended_api/accounting/GET_Config) and [order history](https://docs.transatron.io/transatron_node_api/extended_api/accounting/GET_Orders) from the TransaTron API.

```bash
npm run query-orders:stage
npm run query-orders:prod
```

### check-tx

Look up a transaction by ID using [`getTransactionById`](https://docs.transatron.io/transatron_node_api/accessing_tron_json_rpc/tron_api_extension/POST_GetTransactionById) and decode hex-encoded messages. Pass the transaction ID as an argument:

```bash
npm run check-tx:stage -- <txID>
npm run check-tx:prod -- <txID>
```

---

## Project Structure

```
src/
  config/
    env.ts              # Environment loader (.env.stage / .env.prod)
    tokens.ts           # TRC20 token addresses (USDT, USDC, SUN)
  types/
    transatron.ts       # TransaTron API response types
    coupon.ts           # Coupon request/response types
    accounting.ts       # Accounting config and orders types
    index.ts            # Barrel export
  lib/
    tronweb-factory.ts  # TronWeb instance creation (spender / non-spender)
    trc20.ts            # TRC20 helpers (estimateFeeLimit, simulate, build)
    broadcast.ts        # Broadcast with confirmation polling
    chain-info.ts       # Chain parameters and TransaTron node info
    transatron-api.ts   # TransaTron Extended API client (coupons, pending txs, config, orders)
    format.ts           # Formatting utilities (hexToUnicode, formatSun)
    sleep.ts            # Promise-based delay
  examples/
    sending_tx/         # Transaction sending examples (all fee payment modes)
    accounting/         # Account management, deposits, coupons, queries
```

## Development

```bash
npm run typecheck      # TypeScript type checking
npm run lint           # ESLint
npm run format         # Prettier (write)
npm run format:check   # Prettier (check only)
```

## Documentation

- [TransaTron Documentation](https://docs.transatron.io)
- [Integration Guidelines](https://docs.transatron.io/category/integration-guidelines)
- [TransaTron Node API](https://docs.transatron.io/category/transatron-node-api)
- [Extended API (Coupons, Accounting, Delayed Txs)](https://docs.transatron.io/category/transatron-api-v1)
- [FAQ](https://docs.transatron.io/faq)
- [TronWeb NPM](https://www.npmjs.com/package/tronweb)
