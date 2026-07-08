import { readFile } from "fs/promises";
import path from "path";

export interface SharePerson {
  aliases: string[];
  displayName: string;
  email?: string;
  /** NAVER Works userId (e.g. userf7da-...) */
  naverWorksUserId?: string;
}

export interface PeopleDirectory {
  people: SharePerson[];
}

function normalizeAlias(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

export function resolvePeopleDirectoryPath(): string {
  const explicit = process.env.SHARE_PEOPLE_FILE?.trim();
  if (explicit) return path.resolve(explicit);
  return path.resolve(process.cwd(), "config/share-people.json");
}

async function readDirectoryFile(filePath: string): Promise<PeopleDirectory | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as PeopleDirectory;
    if (!parsed || !Array.isArray(parsed.people)) {
      throw new Error("Invalid people directory: expected { people: [...] }");
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function loadPeopleDirectory(): Promise<PeopleDirectory> {
  const preferred = resolvePeopleDirectoryPath();
  const primary = await readDirectoryFile(preferred);
  return primary ?? { people: [] };
}

export async function resolvePerson(
  recipient: string,
): Promise<
  | { ok: true; person: SharePerson }
  | { ok: false; error: string; suggestions: string[] }
> {
  const directory = await loadPeopleDirectory();
  const needle = normalizeAlias(recipient);

  if (!needle) {
    return {
      ok: false,
      error: "Recipient is empty",
      suggestions: directory.people.map((person) => person.displayName),
    };
  }

  const trimmed = recipient.trim();

  if (/^user[a-z0-9-]+$/i.test(trimmed)) {
    const known = directory.people.find(
      (person) =>
        person.naverWorksUserId?.toLowerCase() === trimmed.toLowerCase(),
    );
    return {
      ok: true,
      person:
        known ??
        ({
          aliases: [trimmed],
          naverWorksUserId: trimmed,
          displayName: trimmed,
        } satisfies SharePerson),
    };
  }

  const matches = directory.people.filter((person) => {
    const names = [person.displayName, ...(person.aliases ?? [])].map(normalizeAlias);
    return names.some(
      (alias) => alias === needle || alias.includes(needle) || needle.includes(alias),
    );
  });

  if (matches.length === 1) {
    return { ok: true, person: matches[0] };
  }

  if (matches.length > 1) {
    return {
      ok: false,
      error: `Ambiguous recipient "${recipient}". Retry with displayName or Works userId.`,
      suggestions: matches.map((person) => {
        const id = person.naverWorksUserId
          ? `works:${person.naverWorksUserId}`
          : "no-works-id";
        return `${person.displayName} (${id})`;
      }),
    };
  }

  return {
    ok: false,
    error:
      `Unknown recipient "${recipient}". Add them to config/share-people.json ` +
      `(copy from config/share-people.example.json).`,
    suggestions: directory.people.map(
      (person) => `${person.displayName} (${person.aliases.join(", ")})`,
    ),
  };
}
