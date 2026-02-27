# tt-tronweb-example2

TransaTron integration examples for TRON fee payment modes.

## Commands

- All example scripts: `npm run <name>:stage` or `npm run <name>:prod` — check `package.json` scripts for full list
- `npm run typecheck`, `npm run lint`, `npm run format`
- Use `npm`, not `yarn` — `yarn.lock` was deleted, `package-lock.json` is the lockfile

## Non-obvious things

- TransaTron **is** the TronWeb `fullHost` — it proxies standard TRON API and adds a `transatron` object to responses with fee quotes and status codes. This means all transactions must broadcast through TransaTron's node, not any other TRON node, because resource delegation happens at broadcast time.
- `txLocal: true` in `triggersmartcontract` is the magic flag — without it you get a plain TRON response with no TransaTron pricing. Every TRC20 example depends on this for fee estimation.
- `message` fields from TransaTron are hex-encoded — always decode with `hexToUnicode()` before displaying.
- Spender key = server-side company key (account payment, coupons, delayed txs). Non-spender key = client-safe key (instant payments). Coupon **creation** needs spender, but coupon **redemption** needs non-spender — because coupons let companies sponsor users who don't have company access.
- Deposit address for **account deposits** comes from `/api/v1/config` (`payment_address`), **not** from `getNodeInfo()`. The deposit scripts were intentionally changed to use the config endpoint.
- Deposit address for **instant payments** must come from `getNodeInfo().deposit_address` — because instant payments use the non-spender API key, and `/api/v1/config` requires a spender key so it can't be queried in that context.
- `broadcastTransaction()` has a 10s initial wait before polling — TransaTron queues need processing time before the tx hits the chain. Don't reduce this or you'll get false "not found" results.
- Delayed transactions sit in the queue until expiration minus 3 minutes, then are automatically sent for execution. Use `api/v1/pendingtxs/flush` to trigger immediate processing. Expiration must be bumped by more than 1 hour and less than 12 hours practically.
- When TFN/TFU balance hits 0, behavior depends on the "bypass" setting in TransaTron dashboard (per API key): if bypass=true, transactions go through TRON directly and burn TRX for fees (much more expensive); if bypass=false, an error is returned and the transaction is not broadcasted.

## Environment

- Two env files only: `.env.stage` and `.env.prod` — selected via `cross-env NODE_ENV=stage|prod`
- 5 required vars: `API`, `PRIVATE_KEY`, `TRANSATRON_API_KEY_NON_SPENDER`, `TRANSATRON_API_KEY_SPENDER`, `TARGET_ADDRESS`

## TronWeb 6.0.4 type pitfalls

- Use `import type { Types } from 'tronweb'` then `Types.SignedTransaction`, `Types.Transaction`, etc. — importing from `tronweb/lib/esm/types` fails under Node16 module resolution because the package only exports `.` and `./utils`.
- `getNodeInfo()` return needs double cast `as unknown as TransatronNodeInfo` because the `transatronInfo` extension field doesn't exist in TronWeb's types.
- `_getTriggerSmartContractArgs` 7th param (`tokenId`) is `string` not `number` — pass `''` not `0`.

## Docs

- TransaTron docs: https://docs.transatron.io — sitemap at `/sitemap.xml`, append `.md` to any sitemap URL for raw markdown
