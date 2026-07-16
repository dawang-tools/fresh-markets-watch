import { scanFreshPairs } from "../src/scan.ts";

const FACTORY = "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6";

async function main() {
  const pairs = await scanFreshPairs({
    chain: "base",
    factories: [FACTORY],
    window_minutes: 60,
  });
  console.log(
    JSON.stringify({ count: pairs.length, sample: pairs.slice(0, 3) }, null, 2),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
