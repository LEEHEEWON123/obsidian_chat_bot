/**
 * Pull NAVER Works members (directory.read) into config/share-people.json.
 *
 *   npm run works:sync-people
 *   DRY_RUN=1 npm run works:sync-people
 */

import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { loadLocalEnv } from "../lib/env/load-local-env";
import { listNaverWorksUsers } from "../lib/naver-works/client";
import type { PeopleDirectory, SharePerson } from "../lib/share/people-directory";
import { resolvePeopleDirectoryPath } from "../lib/share/people-directory";

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

async function loadExisting(filePath: string): Promise<SharePerson[]> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as PeopleDirectory;
    return Array.isArray(parsed.people) ? parsed.people : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function mergePeople(
  existing: SharePerson[],
  fetched: Awaited<ReturnType<typeof listNaverWorksUsers>>,
): SharePerson[] {
  const byUserId = new Map(
    existing
      .filter((person) => person.naverWorksUserId)
      .map((person) => [person.naverWorksUserId!.toLowerCase(), person]),
  );
  const byEmail = new Map(
    existing
      .filter((person) => person.email)
      .map((person) => [person.email!.toLowerCase(), person]),
  );

  return fetched
    .map((user) => {
      const prev =
        byUserId.get(user.userId.toLowerCase()) ??
        (user.email ? byEmail.get(user.email.toLowerCase()) : undefined);

      return {
        aliases: uniqueAliases(prev?.aliases, user.aliases, [user.displayName]),
        displayName: prev?.displayName?.trim() || user.displayName,
        ...(user.email || prev?.email
          ? { email: user.email || prev?.email }
          : {}),
        naverWorksUserId: user.userId,
      } satisfies SharePerson;
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "ko"));
}

async function main(): Promise<void> {
  const outPath = resolvePeopleDirectoryPath();
  const absoluteOut = path.isAbsolute(outPath)
    ? outPath
    : path.resolve(projectRoot, outPath);
  const dryRun = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");

  console.log("Fetching NAVER Works members (directory.read)…");
  const fetched = await listNaverWorksUsers();
  const existing = await loadExisting(absoluteOut);
  const people = mergePeople(existing, fetched);
  const directory: PeopleDirectory = { people };

  console.log(`Fetched ${fetched.length} members → ${people.length} directory entries`);
  for (const person of people.slice(0, 15)) {
    console.log(`  - ${person.displayName} (${person.naverWorksUserId})`);
  }
  if (people.length > 15) {
    console.log(`  … and ${people.length - 15} more`);
  }

  if (dryRun) {
    console.log("\nDRY_RUN=1 — not writing file.");
    console.log(JSON.stringify(directory, null, 2));
    return;
  }

  await mkdir(path.dirname(absoluteOut), { recursive: true });
  await writeFile(absoluteOut, `${JSON.stringify(directory, null, 2)}\n`, "utf8");
  console.log(`\nWrote ${absoluteOut}`);
  console.log('Try in Workspace: "<이름>에게 테스트 보내줘" → 초안 확인 → "보내"');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
