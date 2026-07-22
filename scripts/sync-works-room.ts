/**
 * Fetch a NAVER Works message room by channelId and upsert config/share-rooms.json.
 *
 *   npm run works:sync-room -- e0fd2506-95d8-08a2-defd-c82074ca2703
 *   npm run works:sync-room -- e0fd2506-95d8-08a2-defd-c82074ca2703 --alias 프론트 --alias front
 *   DRY_RUN=1 npm run works:sync-room -- <channelId>
 */

import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { loadLocalEnv } from "../lib/env/load-local-env";
import { getNaverWorksChannel } from "../lib/naver-works/client";
import type { RoomsDirectory, ShareRoom } from "../lib/share/rooms-directory";
import { resolveRoomsDirectoryPath } from "../lib/share/rooms-directory";

loadLocalEnv();

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function uniqueAliases(...groups: Array<string[] | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of groups) {
    for (const alias of group ?? []) {
      const trimmed = alias.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase().replace(/\s+/g, "");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(trimmed);
    }
  }
  return out;
}

function parseArgs(argv: string[]): { channelId: string; aliases: string[] } {
  const positional: string[] = [];
  const aliases: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--alias" || arg === "-a") {
      const next = argv[i + 1]?.trim();
      if (!next) throw new Error("Missing value after --alias");
      aliases.push(next);
      i += 1;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown flag: ${arg}`);
    }
    positional.push(arg);
  }

  const channelId = positional[0]?.trim();
  if (!channelId) {
    throw new Error(
      "Usage: npm run works:sync-room -- <channelId> [--alias 이름 ...]",
    );
  }

  return { channelId, aliases };
}

async function loadExisting(filePath: string): Promise<RoomsDirectory> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as RoomsDirectory;
    if (!parsed || !Array.isArray(parsed.rooms)) {
      throw new Error("Invalid rooms directory: expected { rooms: [...] }");
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { rooms: [] };
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const { channelId, aliases: extraAliases } = parseArgs(process.argv.slice(2));
  const dryRun = process.env.DRY_RUN === "1";

  const channel = await getNaverWorksChannel(channelId);
  const title = channel.title.trim() || channelId;

  const filePath = resolveRoomsDirectoryPath();
  const existing = await loadExisting(filePath);
  const index = existing.rooms.findIndex(
    (room) =>
      room.naverWorksChannelId.toLowerCase() === channelId.toLowerCase(),
  );

  const previous = index >= 0 ? existing.rooms[index] : undefined;
  const room: ShareRoom = {
    title,
    naverWorksChannelId: channel.channelId,
    aliases: uniqueAliases(
      previous?.aliases,
      extraAliases,
      [title],
      [`${title}방`],
    ),
  };

  const next: RoomsDirectory = {
    rooms:
      index >= 0
        ? existing.rooms.map((item, i) => (i === index ? room : item))
        : [...existing.rooms, room],
  };

  console.log(
    JSON.stringify(
      {
        action: index >= 0 ? "updated" : "added",
        filePath,
        channelType: channel.channelType.type,
        room,
        dryRun,
      },
      null,
      2,
    ),
  );

  if (dryRun) return;

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  console.log(`Wrote ${path.relative(projectRoot, filePath)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
