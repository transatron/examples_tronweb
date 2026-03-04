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

## Business-Case Examples

These scripts demonstrate real-world TransaTron integration patterns. Each combines multiple API calls into a complete business flow. Located directly in `src/examples/`.

### hot-wallet-withdrawals

**Business case:** Hot wallet processes a batch of USDT withdrawals to different wallets.

A hardcoded `WITHDRAWALS` array defines recipient addresses and amounts. The script loops through each withdrawal using the account-payment flow (estimate → simulate → build → sign → broadcast), then prints a summary report with txIDs and statuses.

```bash
npm run hot-wallet-withdrawals:stage
npm run hot-wallet-withdrawals:prod
```

|              |                                                                        |
| ------------ | ---------------------------------------------------------------------- |
| **API key**  | Spender                                                                |
| **Fee mode** | Account payment (TFN/TFU balance)                                      |
| **Flow**     | Loop: estimate → simulate → build → sign → broadcast → summary report |

**Steps:**
1. Define withdrawal batch (address + amount pairs)
2. Create spender TronWeb, print sender address
3. For each withdrawal: `estimateFeeLimit()` → `simulateTransaction()` → `buildLocalTransaction()` → sign → `broadcastTransaction()`
4. Print summary table: address, amount, txID, status

---

### hot-wallet-deposits

**Business case:** Merchant deposit flow — user pays USDT to a merchant wallet, merchant sweeps to the hot wallet.

Simulates the full cycle: generates a temporary merchant wallet, sends USDT from the hot wallet (simulating a user deposit), then sweeps from the merchant wallet to the target address. Both steps use account-payment mode.

```bash
npm run hot-wallet-deposits:stage
npm run hot-wallet-deposits:prod
```

|              |                                                             |
| ------------ | ----------------------------------------------------------- |
| **API key**  | Spender (both hot wallet and merchant wallet)               |
| **Fee mode** | Account payment (TFN/TFU balance)                           |
| **Flow**     | Generate temp wallet → deposit to it → sweep to hot wallet  |

**Steps:**
1. Create spender TronWeb (hot wallet)
2. Generate temporary merchant wallet via `TronWeb.createAccount()`
3. **User deposit:** Send USDT from hot wallet to temp wallet (account-payment flow)
4. **Merchant sweep:** Create new TronWeb with temp wallet's private key + spender API key, send USDT from temp wallet to `TARGET_ADDRESS`

---

### non-custodial-bulk-usdt

**Business case:** Read recipients and amounts from a CSV file, send delayed transactions in batch, flush the queue, and verify all on-chain.

Reads `non-custodial-bulk-usdt-recipients.csv` (address,amount per line), broadcasts each as a delayed transaction with bumped expiration, flushes the TransaTron queue, polls until processed, then verifies each transaction on-chain with a final report.

```bash
npm run non-custodial-bulk-usdt:stage
npm run non-custodial-bulk-usdt:prod
```

|              |                                                                                                     |
| ------------ | --------------------------------------------------------------------------------------------------- |
| **API key**  | Spender                                                                                             |
| **Fee mode** | Delayed transaction (batch queue)                                                                   |
| **Flow**     | Read CSV → loop: build + bump expiration + sign(4 args) + broadcast → flush → poll → verify report  |

**Steps:**
1. Parse CSV file into recipient list
2. For each recipient: estimate → simulate → build → bump expiration → regenerate txID → sign(4 args) → broadcast (no wait)
3. After loop: check pending count
4. Flush via `flushPendingTxs()`, poll until all processed
5. Verify each txID via `getTransactionInfo()` — print report table

**CSV format** (`non-custodial-bulk-usdt-recipients.csv`):
```
address,amount
TZ8qsoNskwBayBncMgxLvbkFdotH9fC22Q,5000
TZ8qsoNskwBayBncMgxLvbkFdotH9fC22Q,6000
TZ8qsoNskwBayBncMgxLvbkFdotH9fC22Q,7000
```

---

### non-custodial-cashback

**Business case:** Non-custodial wallet earns cashback on user USDT transfers by setting a custom (higher) energy price on the non-spender API key in the TransaTron dashboard. The difference between user-paid price and actual cost = cashback.

Sends an instant payment (TRX or USDT fee mode), checks TFN/TFU balance before and after via the spender key, and shows the delta as cashback earned.

```bash
npm run non-custodial-cashback:stage
npm run non-custodial-cashback:prod
```

|                  |                                                                 |
| ---------------- | --------------------------------------------------------------- |
| **API keys**     | Spender (balance/orders) + Non-spender (transaction)            |
| **Fee mode**     | Instant payment (configurable: TRX or USDT)                    |
| **Configurable** | `FEE_MODE` (`'TRX'` or `'USDT'`)                               |

**Steps:**
1. Check TFN/TFU balance before (spender: `getAccountingConfig()`)
2. Estimate + simulate via non-spender, get fee quote
3. Get `deposit_address` from `getTransatronNodeInfo()` (non-spender can't query `/api/v1/config`)
4. If TRX mode: build TRX fee tx via `sendTrx()` → broadcast fee → broadcast main
5. If USDT mode: build USDT fee tx via `_triggerSmartContractLocal()` → broadcast fee → broadcast main
6. Check TFN/TFU balance after — show delta (cashback)
7. Query last order via `getOrders()`

**Prerequisite:** Non-spender API key must have a custom energy price configured in the TransaTron dashboard (higher than default).

---

### non-custodial-coupon

**Business case:** Wallet lets users pay for USDT transactions via card or bonus points. Company creates a coupon to cover the blockchain fee, user redeems it when broadcasting. Unused coupon balance is returned to the company.

```bash
npm run non-custodial-coupon:stage
npm run non-custodial-coupon:prod
```

|              |                                                                     |
| ------------ | ------------------------------------------------------------------- |
| **API keys** | Spender (coupon creation, verification, accounting) + Non-spender (user broadcast) |
| **Fee mode** | Coupon payment                                                      |
| **Flow**     | Create coupon → [charge user] → build + attach coupon → broadcast → verify |

**Steps:**
1. **Company:** Estimate fee (spender: `estimateFeeLimit()` + `simulateTransaction()`)
2. **Company:** Create coupon with `rtrx_limit: 0` (spender: `createCoupon()`)
3. *"In production, company charges user via card/bonus points here"*
4. **User:** Build transaction, sign, attach `signedTx.coupon = couponId`, broadcast (non-spender)
5. **Company:** Verify coupon spent (spender: `getCoupon()`) — show TRX spent, remaining returned
6. **Company:** Check account (spender: `getAccountingConfig()`) — show TFN/TFU balances

---

### agentic_register

**Business case:** Fully automated onboarding — programmatically register a new TransaTron account via `POST /api/v1/register`. Builds a signed TRX deposit transaction on a public TronGrid node (no API key needed), submits it with an email to TransaTron, and prints the returned credentials in `.env`-ready format.

```bash
npm run register:stage
npm run register:stage -- user@company.com   # override email via CLI arg
npm run register:prod
```

|                  |                                                                |
| ---------------- | -------------------------------------------------------------- |
| **API key**      | None (unauthenticated — registration creates the keys)         |
| **Fee mode**     | N/A (deposit transaction)                                      |
| **Configurable** | `REGISTRATION_DEPOSIT_ADDRESS`, `REGISTRATION_DEPOSIT_AMOUNT_TRX`, `REGISTRATION_EMAIL` (via `.env`) |

**Steps:**
1. Create a public TronGrid TronWeb instance (for building/signing) and an unauthenticated TransaTron instance (for the `/register` call)
2. Resolve deposit address, amount, and email from env vars or defaults
3. Build and sign a TRX transfer to the deposit address (do **not** broadcast)
4. Call `POST /api/v1/register` with the signed transaction and email
5. Print account details (deposit address, balances, pricing)
6. Print credentials in `.env` format: `TRANSATRON_API_KEY_SPENDER`, `TRANSATRON_API_KEY_NON_SPENDER`, `TRANSATRON_USER_EMAIL`, `TRANSATRON_USER_PASSWORD`

**Important:** Credentials are only returned once during registration — store them immediately.

---

### replenish-trx

**Business case:** Automated TFN balance monitor — checks if the TransaTron TFN (TRX-backed) balance has dropped below a threshold, and deposits TRX to top it up. Prevents unexpected fee spikes when the balance hits 0 and bypass mode kicks in (transactions go through TRON directly at much higher cost).

```bash
npm run replenish-trx:stage
npm run replenish-trx:prod
```

|                  |                                                              |
| ---------------- | ------------------------------------------------------------ |
| **API key**      | Spender                                                      |
| **Fee mode**     | Account payment (TFN balance)                                |
| **Configurable** | `THRESHOLD_SUN` (balance threshold), `TOP_UP_SUN` (deposit amount) |

**Steps:**
1. Create spender TronWeb, print threshold and top-up config
2. `getAccountingConfig()` — check `balance_rtrx`
3. If balance >= threshold, log "no replenishment needed" and exit
4. Get `payment_address` from config, `rtrx_min_deposit` from `getTransatronNodeInfo()`
5. `depositAmount = Math.max(TOP_UP_SUN, rtrx_min_deposit)` — guard against too-small deposits
6. Check wallet TRX balance, send TRX to deposit address
7. Wait 10s, re-query config, print before/after/delta

---

### replenish-usdt

**Business case:** Automated TFU balance monitor — checks if the TransaTron TFU (USDT-backed) balance has dropped below a threshold, and deposits USDT to top it up. Same rationale as replenish-trx but for USDT-denominated fees.

```bash
npm run replenish-usdt:stage
npm run replenish-usdt:prod
```

|                  |                                                              |
| ---------------- | ------------------------------------------------------------ |
| **API key**      | Spender                                                      |
| **Fee mode**     | Account payment (TFU balance)                                |
| **Configurable** | `THRESHOLD_USDT` (balance threshold), `TOP_UP_USDT` (deposit amount) |

**Steps:**
1. Create spender TronWeb, print threshold and top-up config
2. `getAccountingConfig()` — check `balance_rusdt`
3. If balance >= threshold, log "no replenishment needed" and exit
4. Get `payment_address` from config, `rusdt_min_deposit` from `getTransatronNodeInfo()`
5. `depositAmount = Math.max(TOP_UP_USDT, rusdt_min_deposit)` — guard against too-small deposits
6. Check wallet USDT balance via `contract().at(TOKENS.USDT).balanceOf()`
7. `estimateFeeLimit()` → `buildLocalTransaction()` → sign → broadcast
8. Wait 10s, re-query config, print before/after/delta

---

## Technical Reference Examples

<details>
<summary>Sending Transactions (src/examples/sending_tx/)</summary>

These scripts demonstrate the full lifecycle of sending TRX and TRC20 tokens through TransaTron using different fee payment modes. See the [Sending Transactions](https://docs.transatron.io/integration_guidelines/sending-transactions/SendingTransaction) integration guide for the general flow.

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

</details>

<details>
<summary>Accounting & Management (src/examples/accounting/)</summary>

These scripts handle account top-ups, balance checks, coupon lifecycle, and order queries via the TransaTron Extended API. See [Accounts & Balances](https://docs.transatron.io/integration_guidelines/accounts-balances) for an overview of TFN/TFU tokens and deposit flows.

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

</details>

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
    hot-wallet-withdrawals.ts         # Batch USDT withdrawals (account payment)
    hot-wallet-deposits.ts            # Merchant deposit + sweep flow
    non-custodial-bulk-usdt-payments.ts  # CSV-based delayed batch payments
    non-custodial-bulk-usdt-recipients.csv  # Sample CSV for bulk payments
    non-custodial-cashback.ts         # Cashback via instant payment pricing delta
    non-custodial-coupon-payment.ts   # Coupon-based card/bonus payment
    agentic_register.ts               # Programmatic account registration
    replenish-trx.ts                  # Automated TFN balance replenisher
    replenish-usdt.ts                 # Automated TFU balance replenisher
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
