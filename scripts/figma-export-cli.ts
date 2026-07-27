import { loadLocalEnv } from "../lib/env/load-local-env";
import { getConfig } from "../lib/config";
import { exportFigmaNode } from "../lib/figma/export-node";

loadLocalEnv();

function usage(): never {
  console.error(`Usage:
  npm run figma:export -- "<figma-url-with-node-id>"
  npm run figma:export -- --file <fileKey> --node <nodeId>
  npm run figma:export -- --file <fileKey> --node <nodeId> --force
`);
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const out: {
    urlOrKey?: string;
    fileKey?: string;
    nodeId?: string;
    force?: boolean;
  } = {};

  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--file") {
      out.fileKey = argv[++i];
    } else if (arg === "--node") {
      out.nodeId = argv[++i];
    } else if (arg === "--force") {
      out.force = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
    } else {
      rest.push(arg);
    }
  }
  if (rest[0]) out.urlOrKey = rest[0];
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.urlOrKey && !(args.fileKey && args.nodeId)) {
    usage();
  }

  const config = getConfig();
  if (!config.vaultPath) {
    throw new Error("VAULT_PATH is not set");
  }

  const result = await exportFigmaNode({
    vaultPath: config.vaultPath,
    indexDir: config.figmaIndexDir,
    urlOrKey: args.urlOrKey,
    fileKey: args.fileKey,
    nodeId: args.nodeId,
    force: args.force,
  });

  console.log(
    JSON.stringify(
      {
        skipped: result.skipped,
        change: result.change.kind,
        name: result.name,
        fingerprint: result.fingerprint,
        relativeMd: result.paths.relativeMd,
        paths: result.paths,
        changeDetail:
          result.change.kind === "updated" ? result.change : undefined,
      },
      null,
      2,
    ),
  );

  if (!result.skipped) {
    console.error(
      `\nNext: npm run index   # incremental upsert for ${result.paths.relativeMd}`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
