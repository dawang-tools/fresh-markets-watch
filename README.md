# Fresh Markets Watch

Daydreams AI bounty [#1](https://github.com/daydreamsai/agent-bounties/issues/1).

## What it does
Scans Uniswap V2-style `PairCreated` logs on Base and returns new pairs in the last N minutes.

## Run locally
```bash
npm install
npm run smoke
npm start
# POST http://127.0.0.1:8787/watch
# {"chain":"base","factories":["0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6"],"window_minutes":5}
```

## x402
Set `X402_PRICE_USDC` and `X402_PAY_TO` to require payment (`402` without `X-PAYMENT` header).

## Evidence
See `evidence/` for live Base scan samples.
