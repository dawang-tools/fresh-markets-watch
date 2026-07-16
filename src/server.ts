/**
 * HTTP entry — POST /watch {chain,factories,window_minutes}
 * GET /health
 *
 * x402 gate: set X402_PRICE_USDC (optional). When set, unpaid requests get 402
 * with payment instructions; paid requests (X-PAYMENT header present) proceed.
 * Full facilitator verification can be wired later; this exposes the payment surface.
 */
import { createServer } from "node:http";
import { scanFreshPairs } from "./scan.ts";

const PORT = Number(process.env.PORT || 8787);
const PRICE = process.env.X402_PRICE_USDC || ""; // e.g. "0.01"
const PAY_TO = process.env.X402_PAY_TO || ""; // EVM receive address for x402

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "fresh-markets-watch", x402: Boolean(PRICE) }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/watch") {
    if (PRICE && !req.headers["x-payment"]) {
      res.writeHead(402, {
        "Content-Type": "application/json",
        "Payment-Required": "true",
      });
      res.end(
        JSON.stringify({
          ok: false,
          error: "payment_required",
          x402: {
            price_usdc: PRICE,
            pay_to: PAY_TO || null,
            network: "base",
            note: "Retry with X-PAYMENT proof after settling USDC via x402",
          },
        }),
      );
      return;
    }

    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    let body: {
      chain?: string;
      factories?: string[];
      window_minutes?: number;
      rpc_url?: string;
    } = {};
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "invalid_json" }));
      return;
    }

    try {
      const chain = body.chain || "base";
      const factories =
        body.factories && body.factories.length
          ? body.factories
          : ["0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6"];
      const window_minutes = Number(body.window_minutes || 5);
      const pairs = await scanFreshPairs({
        chain,
        factories,
        window_minutes,
        rpc_url: body.rpc_url,
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          chain,
          window_minutes,
          count: pairs.length,
          pairs,
        }),
      );
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        }),
      );
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: false, error: "not_found" }));
});

server.listen(PORT, () => {
  console.log(`fresh-markets-watch on :${PORT}  POST /watch  GET /health`);
});
