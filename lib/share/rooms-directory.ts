import { readFile } from "fs/promises";
import path from "path";

export interface ShareRoom {
  aliases: string[];
  title: string;
  /** NAVER Works message room channelId (UUID) */
  naverWorksChannelId: string;
}

export interface RoomsDirectory {
  rooms: ShareRoom[];
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ROOM_SUFFIX_RE = /(방|채팅방|그룹|채널)$/;

function normalizeAlias(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

export function isChannelId(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function resolveRoomsDirectoryPath(): string {
  const explicit = process.env.SHARE_ROOMS_FILE?.trim();
  if (explicit) return path.resolve(explicit);
  return path.resolve(process.cwd(), "config/share-rooms.json");
}

function roomLookupNames(room: ShareRoom): string[] {
  const names = [room.title, ...(room.aliases ?? [])].map(normalizeAlias);
  return names.filter(Boolean);
}

function stripRoomSuffix(value: string): string {
  return value.trim().replace(ROOM_SUFFIX_RE, "").trim();
}

async function readDirectoryFile(filePath: string): Promise<RoomsDirectory | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as RoomsDirectory;
    if (!parsed || !Array.isArray(parsed.rooms)) {
      throw new Error("Invalid rooms directory: expected { rooms: [...] }");
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function loadRoomsDirectory(): Promise<RoomsDirectory> {
  const preferred = resolveRoomsDirectoryPath();
  const primary = await readDirectoryFile(preferred);
  return primary ?? { rooms: [] };
}

export async function resolveRoom(
  recipient: string,
): Promise<
  | { ok: true; room: ShareRoom }
  | { ok: false; error: string; suggestions: string[] }
> {
  const directory = await loadRoomsDirectory();
  const trimmed = recipient.trim();
  const suggestions = directory.rooms.map(
    (room) => `${room.title} (${room.aliases.join(", ")})`,
  );

  if (!trimmed) {
    return { ok: false, error: "Room target is empty", suggestions };
  }

  if (isChannelId(trimmed)) {
    const known = directory.rooms.find(
      (room) =>
        room.naverWorksChannelId.toLowerCase() === trimmed.toLowerCase(),
    );
    return {
      ok: true,
      room:
        known ??
        ({
          aliases: [trimmed],
          naverWorksChannelId: trimmed,
          title: trimmed,
        } satisfies ShareRoom),
    };
  }

  const needles = Array.from(
    new Set(
      [trimmed, stripRoomSuffix(trimmed)]
        .map(normalizeAlias)
        .filter(Boolean),
    ),
  );

  const matches = directory.rooms.filter((room) => {
    const names = roomLookupNames(room);
    return needles.some((needle) =>
      names.some(
        (alias) =>
          alias === needle || alias.includes(needle) || needle.includes(alias),
      ),
    );
  });

  if (matches.length === 1) {
    return { ok: true, room: matches[0] };
  }

  if (matches.length > 1) {
    return {
      ok: false,
      error: `Ambiguous room "${recipient}". Retry with room title or channelId.`,
      suggestions: matches.map(
        (room) =>
          `${room.title} (channel:${room.naverWorksChannelId.slice(0, 8)}…)`,
      ),
    };
  }

  return {
    ok: false,
    error:
      `Unknown room "${recipient}". Add it to config/share-rooms.json ` +
      `(copy from config/share-rooms.example.json, or run npm run works:sync-room -- <channelId>).`,
    suggestions,
  };
}
