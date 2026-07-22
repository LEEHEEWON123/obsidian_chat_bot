import { createPrivateKey, createSign, createHash } from "crypto";
import { readFile } from "fs/promises";

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cached: CachedToken | null = null;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is not set. Configure NAVER Works service-account auth in .env.local.`,
    );
  }
  return value;
}

function base64Url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function loadPrivateKeyPem(): Promise<string> {
  const inline = process.env.NAVER_WORKS_PRIVATE_KEY?.trim();
  if (inline) {
    return inline.replace(/\\n/g, "\n");
  }
  const filePath = process.env.NAVER_WORKS_PRIVATE_KEY_PATH?.trim();
  if (!filePath) {
    throw new Error(
      "Set NAVER_WORKS_PRIVATE_KEY or NAVER_WORKS_PRIVATE_KEY_PATH for JWT auth.",
    );
  }
  return readFile(filePath, "utf8");
}

async function createServiceAccountJwt(): Promise<string> {
  const clientId = requiredEnv("NAVER_WORKS_CLIENT_ID");
  const serviceAccount = requiredEnv("NAVER_WORKS_SERVICE_ACCOUNT");
  const privateKeyPem = await loadPrivateKeyPem();

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iss: clientId,
      sub: serviceAccount,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const key = createPrivateKey(privateKeyPem);
  const signature = createSign("RSA-SHA256").update(signingInput).sign(key);
  return `${signingInput}.${base64Url(signature)}`;
}

export async function getNaverWorksAccessToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt > now + 60_000) {
    return cached.accessToken;
  }

  const clientId = requiredEnv("NAVER_WORKS_CLIENT_ID");
  const clientSecret = requiredEnv("NAVER_WORKS_CLIENT_SECRET");
  const assertion = await createServiceAccountJwt();
  const scope =
    process.env.NAVER_WORKS_SCOPE?.trim() ||
    "bot bot.message bot.read directory.read";

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    client_id: clientId,
    client_secret: clientSecret,
    assertion,
    scope,
  });

  const response = await fetch("https://auth.worksmobile.com/oauth2/v2.0/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`NAVER Works token HTTP ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: string | number;
    error?: string;
    error_description?: string;
  };

  if (!data.access_token) {
    throw new Error(
      `NAVER Works token failed: ${data.error ?? "unknown"} ${data.error_description ?? ""}`.trim(),
    );
  }

  const expiresInSec = Number(data.expires_in ?? 3600);
  cached = {
    accessToken: data.access_token,
    expiresAt: now + Math.max(60, expiresInSec) * 1000,
  };
  return data.access_token;
}

export interface NaverWorksUser {
  userId: string;
  email?: string;
  displayName: string;
  aliases: string[];
}

interface WorksUserName {
  lastName?: string | null;
  firstName?: string | null;
}

interface WorksUserResponse {
  userId?: string;
  email?: string | null;
  nickName?: string | null;
  userName?: WorksUserName | null;
  organizations?: Array<{ email?: string | null }> | null;
}

function buildDisplayName(user: WorksUserResponse): string {
  const last = user.userName?.lastName?.trim() ?? "";
  const first = user.userName?.firstName?.trim() ?? "";
  const full = `${last}${first}`.trim();
  if (full) return full;
  if (user.nickName?.trim()) return user.nickName.trim();
  const email = user.email || user.organizations?.[0]?.email;
  if (email?.trim()) return email.trim().split("@")[0] ?? email.trim();
  return user.userId?.trim() || "unknown";
}

function buildAliases(user: WorksUserResponse, displayName: string): string[] {
  const aliases = new Set<string>();
  if (displayName) aliases.add(displayName);
  const first = user.userName?.firstName?.trim();
  const last = user.userName?.lastName?.trim();
  if (first) aliases.add(first);
  if (last && first) aliases.add(`${last}${first}`);
  if (user.nickName?.trim()) aliases.add(user.nickName.trim());
  const email = (user.email || user.organizations?.[0]?.email)?.trim();
  if (email) {
    const local = email.split("@")[0]?.trim();
    if (local) aliases.add(local);
  }
  return Array.from(aliases).filter(Boolean);
}

/** List domain members (requires `directory.read`). */
export async function listNaverWorksUsers(): Promise<NaverWorksUser[]> {
  const token = await getNaverWorksAccessToken();
  const people: NaverWorksUser[] = [];
  let cursor: string | undefined;

  for (;;) {
    const url = new URL("https://www.worksapis.com/v1.0/users");
    url.searchParams.set("count", "100");
    if (cursor) url.searchParams.set("cursor", cursor);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `NAVER Works list users failed HTTP ${response.status}: ${text || "empty body"}`,
      );
    }

    const data = (await response.json()) as {
      users?: WorksUserResponse[];
      responseMetaData?: { nextCursor?: string };
    };

    for (const user of data.users ?? []) {
      const userId = user.userId?.trim();
      if (!userId) continue;
      const displayName = buildDisplayName(user);
      const email =
        user.email?.trim() || user.organizations?.[0]?.email?.trim() || undefined;
      people.push({
        userId,
        email,
        displayName,
        aliases: buildAliases(user, displayName),
      });
    }

    const next = data.responseMetaData?.nextCursor?.trim();
    if (!next) break;
    cursor = next;
  }

  return people;
}

export async function sendNaverWorksDm(options: {
  userId: string;
  text: string;
}): Promise<{ botId: string; userId: string; requestId: string }> {
  const botId = requiredEnv("NAVER_WORKS_BOT_ID");
  const token = await getNaverWorksAccessToken();
  const requestId = createHash("sha256")
    .update(`${Date.now()}:${options.userId}:${options.text.slice(0, 32)}`)
    .digest("hex")
    .slice(0, 16);

  const response = await fetch(
    `https://www.worksapis.com/v1.0/bots/${encodeURIComponent(botId)}/users/${encodeURIComponent(options.userId)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: {
          type: "text",
          text: options.text,
        },
      }),
    },
  );

  if (response.status !== 201 && !response.ok) {
    const text = await response.text();
    throw new Error(
      `NAVER Works send failed HTTP ${response.status}: ${text || "empty body"}`,
    );
  }

  return { botId, userId: options.userId, requestId };
}

export interface NaverWorksChannel {
  domainId: number;
  channelId: string;
  title: string;
  channelType: {
    type: "SINGLE_USER" | "MULTI_USERS" | "ORGUNIT" | "GROUP";
    orgUnitId?: string;
    groupId?: string;
  };
}

/** Fetch message room details (requires `bot.read`). */
export async function getNaverWorksChannel(
  channelId: string,
): Promise<NaverWorksChannel> {
  const botId = requiredEnv("NAVER_WORKS_BOT_ID");
  const token = await getNaverWorksAccessToken();

  const response = await fetch(
    `https://www.worksapis.com/v1.0/bots/${encodeURIComponent(botId)}/channels/${encodeURIComponent(channelId)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `NAVER Works channel lookup failed HTTP ${response.status}: ${text || "empty body"}`,
    );
  }

  return (await response.json()) as NaverWorksChannel;
}

export async function sendNaverWorksChannelMessage(options: {
  channelId: string;
  text: string;
}): Promise<{ botId: string; channelId: string; requestId: string }> {
  const botId = requiredEnv("NAVER_WORKS_BOT_ID");
  const token = await getNaverWorksAccessToken();
  const requestId = createHash("sha256")
    .update(`${Date.now()}:${options.channelId}:${options.text.slice(0, 32)}`)
    .digest("hex")
    .slice(0, 16);

  const response = await fetch(
    `https://www.worksapis.com/v1.0/bots/${encodeURIComponent(botId)}/channels/${encodeURIComponent(options.channelId)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: {
          type: "text",
          text: options.text,
        },
      }),
    },
  );

  if (response.status !== 201 && !response.ok) {
    const text = await response.text();
    throw new Error(
      `NAVER Works channel send failed HTTP ${response.status}: ${text || "empty body"}`,
    );
  }

  return { botId, channelId: options.channelId, requestId };
}
