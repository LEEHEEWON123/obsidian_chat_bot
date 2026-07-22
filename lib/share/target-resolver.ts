import { resolvePerson, type SharePerson } from "@/lib/share/people-directory";
import {
  isChannelId,
  resolveRoom,
  type ShareRoom,
} from "@/lib/share/rooms-directory";

export type ShareTarget =
  | { kind: "person"; person: SharePerson; displayName: string }
  | { kind: "room"; room: ShareRoom; displayName: string };

export async function resolveShareTarget(
  recipient: string,
): Promise<
  | { ok: true; target: ShareTarget }
  | { ok: false; error: string; suggestions: string[] }
> {
  const trimmed = recipient.trim();
  if (!trimmed) {
    return { ok: false, error: "Recipient is empty", suggestions: [] };
  }

  if (isChannelId(trimmed)) {
    const room = await resolveRoom(trimmed);
    if (!room.ok) return room;
    return {
      ok: true,
      target: {
        kind: "room",
        room: room.room,
        displayName: room.room.title,
      },
    };
  }

  const [personResult, roomResult] = await Promise.all([
    resolvePerson(trimmed),
    resolveRoom(trimmed),
  ]);

  const personOk = personResult.ok;
  const roomOk = roomResult.ok;

  if (personOk && !roomOk) {
    return {
      ok: true,
      target: {
        kind: "person",
        person: personResult.person,
        displayName: personResult.person.displayName,
      },
    };
  }

  if (roomOk && !personOk) {
    return {
      ok: true,
      target: {
        kind: "room",
        room: roomResult.room,
        displayName: roomResult.room.title,
      },
    };
  }

  if (personOk && roomOk) {
    return {
      ok: false,
      error:
        `Ambiguous target "${recipient}" matches both a person and a room. ` +
        "Use a more specific name or Works userId / channelId.",
      suggestions: [
        `person: ${personResult.person.displayName}`,
        `room: ${roomResult.room.title} (${roomResult.room.naverWorksChannelId})`,
      ],
    };
  }

  const suggestions = [
    ...(personResult.ok ? [] : personResult.suggestions),
    ...(roomResult.ok ? [] : roomResult.suggestions),
  ];

  const error = !personResult.ok
    ? personResult.error
    : !roomResult.ok
      ? roomResult.error
      : `Unknown recipient "${recipient}". Add them to config/share-people.json or a room to config/share-rooms.json.`;

  return {
    ok: false,
    error,
    suggestions: Array.from(new Set(suggestions)),
  };
}
