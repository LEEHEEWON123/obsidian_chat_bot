import { indexAxClipImages } from "../lib/ax-case/clip";
import { loadLocalEnv } from "../lib/env/load-local-env";

loadLocalEnv();

async function main(): Promise<void> {
  const result = await indexAxClipImages();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
