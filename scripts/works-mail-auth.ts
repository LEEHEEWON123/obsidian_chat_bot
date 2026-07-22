/**
 * One-time User OAuth for NAVER Works Mail API (Service Account JWT cannot read mail).
 *
 *   npm run works:mail-auth
 *   npm run works:mail-auth -- --code=<authorization_code>
 */

import { loadLocalEnv } from "../lib/env/load-local-env";
import {
  buildUserAuthorizeUrl,
  exchangeAuthorizationCode,
  oauthRedirectUri,
  userOAuthScope,
} from "../lib/naver-works/user-oauth";

loadLocalEnv();

function parseCode(argv: string[]): string | undefined {
  for (const arg of argv) {
    if (arg.startsWith("--code=")) return arg.slice("--code=".length).trim();
  }
  return undefined;
}

async function main(): Promise<void> {
  const code = parseCode(process.argv.slice(2));

  if (!code) {
    console.log(
      JSON.stringify(
        {
          step: "authorize",
          scope: userOAuthScope(),
          redirectUri: oauthRedirectUri(),
          authorizeUrl: buildUserAuthorizeUrl(),
          next:
            "Login in browser, copy ?code= from redirect URL, then: npm run works:mail-auth -- --code=<code>",
          envHint:
            "Paste refresh_token into .env.local as NAVER_WORKS_USER_REFRESH_TOKEN",
        },
        null,
        2,
      ),
    );
    return;
  }

  const tokens = await exchangeAuthorizationCode(code);
  console.log(
    JSON.stringify(
      {
        step: "token_issued",
        scope: tokens.scope,
        expiresInSec: tokens.expiresInSec,
        refreshToken: tokens.refreshToken,
        note: "Add to .env.local: NAVER_WORKS_USER_REFRESH_TOKEN=<refreshToken>",
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
