import { z } from "zod";
import { createAgentApp } from "@lucid-dreams/agent-kit";

/**
 * Fresh Markets Watch — https://github.com/daydreamsai/agent-bounties/issues/1
 * Detect new UniswapV2-style pairs via PairCreated logs.
 */

const PAIR_CREATED_TOPIC =
  "0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9";

const DEFAULT_RPC: Record<string, string> = {
  base: "https://mainnet.base.org",
  ethereum: "https://ethereum.publicnode.com",
};

const PairResult = z.object({
  pair_address: z.string(),
  tokens: z.array(z.string()),
  init_liquidity: z.string(),
  top_holders: z.array(z.string()),
  created_at: z.string(),
  tx_hash: z.string().optional(),
  block_number: z.string().optional(),
});

const { app, addEntrypoint } = createAgentApp({
  name: "fresh-markets-watch",
  version: "0.2.0",
  description: "List new AMM pairs or pools in the last few minutes",
});

addEntrypoint({
  key: "watch",
  description: "Scan AMM factories for pairs created in window_minutes",
  input: z.object({
    chain: z.string().default("base"),
    factories: z.array(z.string()).min(1),
    window_minutes: z.number().int().positive().default(5),
    rpc_url: z.string().optional(),
  }),
  async handler({ input }) {
    const pairs = await scanFreshPairs(input);
    return {
      output: {
        pairs,
        count: pairs.length,
        chain: input.chain,
        window_minutes: input.window_minutes,
      },
      usage: { total_tokens: String(pairs.length) },
    };
  },
});

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
  const body = (await res.json()) as { result?: unknown; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message || "rpc_error");
  return body.result;
}

async function scanFreshPairs(input: {
  chain: string;
  factories: string[];
  window_minutes: number;
  rpc_url?: string;
}): Promise<z.infer<typeof PairResult>[]> {
  const rpcUrl = input.rpc_url || DEFAULT_RPC[input.chain] || DEFAULT_RPC.base;
  const latestHex = (await rpc(rpcUrl, "eth_blockNumber", [])) as string;
  const latest = parseInt(latestHex, 16);
  // Base ~2s blocks; over-estimate to avoid missing
  const blocksBack = Math.max(Math.floor((input.window_minutes * 60) / 2), 50);
  const fromBlock = "0x" + Math.max(latest - blocksBack, 0).toString(16);

  const out: z.infer<typeof PairResult>[] = [];
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
      const pair =
        data.length >= 64 ? "0x" + data.slice(24, 64) : "0x";
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

export { scanFreshPairs, DEFAULT_RPC };
export default app;
