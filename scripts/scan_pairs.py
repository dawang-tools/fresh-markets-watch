# -*- coding: utf-8 -*-
"""Implement Uniswap V2 PairCreated log scan for Fresh Markets Watch."""
from __future__ import annotations

import json
import time
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path

# Uniswap V2 PairCreated(address,address,address,uint256)
PAIR_CREATED_TOPIC = (
    "0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9"
)

OUT = Path(r"H:\job\bounties\daydreamsai\fresh-markets-watch\evidence")
OUT.mkdir(parents=True, exist_ok=True)


@dataclass
class FreshPair:
    pair_address: str
    tokens: list[str]
    init_liquidity: str
    top_holders: list[str]
    created_at: str
    tx_hash: str
    block_number: str


def eth_call(rpc: str, method: str, params: list) -> dict:
    payload = json.dumps(
        {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    ).encode()
    req = urllib.request.Request(
        rpc,
        data=payload,
        headers={"Content-Type": "application/json", "User-Agent": "dawang-agent/1.0"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=40) as resp:
        return json.loads(resp.read().decode())


def topic_addr(topic: str) -> str:
    t = topic.lower().replace("0x", "")
    return "0x" + t[-40:]


def scan(
    rpc: str,
    factory: str,
    window_minutes: int = 30,
    chain: str = "base",
) -> list[FreshPair]:
    block_hex = eth_call(rpc, "eth_blockNumber", [])["result"]
    latest = int(block_hex, 16)
    # ~2s blocks on Base; over-estimate window
    blocks_back = max(int(window_minutes * 60 / 2), 50)
    frm = hex(max(latest - blocks_back, 0))
    logs = eth_call(
        rpc,
        "eth_getLogs",
        [
            {
                "fromBlock": frm,
                "toBlock": "latest",
                "address": factory,
                "topics": [PAIR_CREATED_TOPIC],
            }
        ],
    ).get("result") or []

    pairs: list[FreshPair] = []
    for lg in logs:
        topics = lg.get("topics") or []
        if len(topics) < 3:
            continue
        t0 = topic_addr(topics[1])
        t1 = topic_addr(topics[2])
        data = (lg.get("data") or "0x")[2:]
        # pair is first 32 bytes of data for UniswapV2
        pair = "0x" + data[24:64] if len(data) >= 64 else ""
        bn = str(int(lg.get("blockNumber", "0x0"), 16))
        pairs.append(
            FreshPair(
                pair_address=pair,
                tokens=[t0, t1],
                init_liquidity="unknown",
                top_holders=[],
                created_at=f"block:{bn}",
                tx_hash=lg.get("transactionHash") or "",
                block_number=bn,
            )
        )
    stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    out = {
        "chain": chain,
        "factory": factory,
        "window_minutes": window_minutes,
        "latest_block": latest,
        "count": len(pairs),
        "pairs": [asdict(p) for p in pairs],
    }
    path = OUT / f"scan_{chain}_{stamp}.json"
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print("wrote", path, "pairs", len(pairs))
    return pairs


def main() -> None:
    # Public Base RPC — may rate-limit; swap to Alchemy/Infura when available
    rpc = "https://mainnet.base.org"
    # Uniswap V2-style factory on Base (Aerodrome/others may differ — start with UniV2 clone if known)
    # Base Uniswap V2 factory is often 0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6 (verify before claim)
    factory = "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6"
    try:
        scan(rpc, factory, window_minutes=60, chain="base")
    except Exception as e:
        print("scan_failed", type(e).__name__, e)
        (OUT / "last_error.txt").write_text(str(e), encoding="utf-8")


if __name__ == "__main__":
    main()
