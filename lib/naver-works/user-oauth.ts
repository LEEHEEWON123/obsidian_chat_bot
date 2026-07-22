interface CachedUserToken {
  accessToken: string;
  expiresAt: number;
  refreshToken: string;
}

let cachedUser: CachedUserToken | null = null;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set.`);
  }
  return value;
}

function clientId(): string {
  return requiredEnv("NAVER_WORKS_CLIENT_ID");
}

function clientSecret(): string {
  return requiredEnv("NAVER_WORKS_CLIENT_SECRET");
}

export function userOAuthScope(): string {
  return (
    process.env.NAVER_WORKS_USER_OAUTH_SCOPE?.trim() || "mail.read user.read"
  );
}

export function oauthRedirectUri(): string {
  return (
    process.env.NAVER_WORKS_OAUTH_REDIRECT_URI?.trim() ||
    "http://127.0.0.1:8787/callback"
  );
}

export function buildUserAuthorizeUrl(state = "works-mail-auth"): string {
  const url = new URL("https://auth.worksmobile.com/oauth2/v2.0/authorize");
  url.searchParams.set("client_id", clientId());
  url.searchParams.set("redirect_uri", oauthRedirectUri());
  url.searchParams.set("scope", userOAuthScope());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeAuthorizationCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
  scope: string;
}> {
  const body = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: oauthRedirectUri(),
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
    throw new Error(`OAuth code exchange failed HTTP ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: string | number;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (!data.access_token || !data.refresh_token) {
    throw new Error(
      `OAuth code exchange missing tokens: ${data.error ?? "unknown"} ${data.error_description ?? ""}`.trim(),
    );
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresInSec: Number(data.expires_in ?? 3600),
    scope: data.scope ?? userOAuthScope(),
  };
}

async function refreshUserAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
}> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    client_id: clientId(),
    client_secret: clientSecret(),
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
    throw new Error(`OAuth refresh failed HTTP ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: string | number;
    error?: string;
    error_description?: string;
  };

  if (!data.access_token) {
    throw new Error(
      `OAuth refresh missing access_token: ${data.error ?? "unknown"} ${data.error_description ?? ""}`.trim(),
    );
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token?.trim() || refreshToken,
    expiresInSec: Number(data.expires_in ?? 3600),
  };
}

/** User OAuth access token (mail API). Requires NAVER_WORKS_USER_REFRESH_TOKEN. */
export async function getNaverWorksUserAccessToken(): Promise<string> {
  const now = Date.now();
  const refreshToken = requiredEnv("NAVER_WORKS_USER_REFRESH_TOKEN");

  if (cachedUser && cachedUser.expiresAt > now + 60_000) {
    return cachedUser.accessToken;
  }

  const refreshed = await refreshUserAccessToken(refreshToken);
  cachedUser = {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    expiresAt: now + Math.max(60, refreshed.expiresInSec) * 1000,
  };
  return cachedUser.accessToken;
}
