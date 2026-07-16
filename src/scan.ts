/**
 * Core scanner — no agent-kit dependency (kit optional later).
 */
export const PAIR_CREATED_TOPIC =
  "0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9";

export const DEFAULT_RPC: Record<string, string> = {
  base: "https://mainnet.base.org",
  ethereum: "https://ethereum.publicnode.com",
};

export type FreshPair = {
  pair_address: string;
  tokens: string[];
  init_liquidity: string;
  top_holders: string[];
  created_at: string;
  tx_hash?: string;
  block_number?: string;
};

function topicAddr(topic: string): string {
  const t = topic.toLowerCase().replace(/^0x/, "");
  return "0x" + t.slice(-40);
}

async function rpc(
  url: string,
  method: string,
  params: unknown[],
): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`rpc_http_${res.status}`);
  const body = (await res.json()) as {
    result?: unknown;
    error?: { message?: string };
  };
  if (body.error) throw new Error(body.error.message || "rpc_error");
  return body.result;
}

export async function scanFreshPairs(input: {
  chain: string;
  factories: string[];
  window_minutes: number;
  rpc_url?: string;
}): Promise<FreshPair[]> {
  const rpcUrl = input.rpc_url || DEFAULT_RPC[input.chain] || DEFAULT_RPC.base;
  const latestHex = (await rpc(rpcUrl, "eth_blockNumber", [])) as string;
  const latest = parseInt(latestHex, 16);
  const blocksBack = Math.max(Math.floor((input.window_minutes * 60) / 2), 50);
  const fromBlock = "0x" + Math.max(latest - blocksBack, 0).toString(16);
  const out: FreshPair[] = [];

  for (const factory of input.factories) {
    const logs = (await rpc(rpcUrl, "eth_getLogs", [
      {
        fromBlock,
        toBlock: "latest",
        address: factory,
        topics: [PAIR_CREATED_TOPIC],
      },
    ])) as Array<{
      topics?: string[];
      data?: string;
      blockNumber?: string;
      transactionHash?: string;
    }>;

    for (const lg of logs || []) {
      const topics = lg.topics || [];
      if (topics.length < 3) continue;
      const data = (lg.data || "0x").replace(/^0x/, "");
      const pair = data.length >= 64 ? "0x" + data.slice(24, 64) : "0x";
      const bn = String(parseInt(lg.blockNumber || "0x0", 16));
      out.push({
        pair_address: pair,
        tokens: [topicAddr(topics[1]), topicAddr(topics[2])],
        init_liquidity: "unknown",
        top_holders: [],
        created_at: `block:${bn}`,
        tx_hash: lg.transactionHash,
        block_number: bn,
      });
    }
  }
  return out;
}
