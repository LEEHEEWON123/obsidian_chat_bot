import { runAssetQuery } from "../lib/ax-case/asset-query";
import { searchAxClipImages } from "../lib/ax-case/clip";
import { loadLocalEnv } from "../lib/env/load-local-env";

loadLocalEnv();

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "top";
  if (mode === "search") {
    const query = process.argv.slice(3).join(" ") || "사용 장면";
    const result = await searchAxClipImages({
      query,
      topK: 5,
      enrich: true,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const result = await runAssetQuery({
    operation: "top_performers",
    metric: "conversions",
    limit: 3,
    confirmedOnly: true,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
