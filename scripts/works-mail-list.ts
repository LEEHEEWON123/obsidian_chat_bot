/**
 * List NAVER Works mailbox (User OAuth + mail.read).
 *
 *   npm run works:mail-list
 *   npm run works:mail-list -- --user ykjung@dobedub.com --count 10
 *   npm run works:mail-list -- --mail-id 76289
 */

import { loadLocalEnv } from "../lib/env/load-local-env";
import {
  getNaverWorksMail,
  listNaverWorksMailFolders,
  listNaverWorksMails,
} from "../lib/naver-works/mail";

loadLocalEnv();

function parseArgs(argv: string[]): {
  user?: string;
  folderId?: number;
  count?: number;
  unreadOnly: boolean;
  mailId?: string;
} {
  let user: string | undefined;
  let folderId: number | undefined;
  let count: number | undefined;
  let unreadOnly = false;
  let mailId: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--user" || arg === "-u") {
      user = argv[++i]?.trim();
      continue;
    }
    if (arg === "--folder" || arg === "-f") {
      folderId = Number(argv[++i]);
      continue;
    }
    if (arg === "--count" || arg === "-n") {
      count = Number(argv[++i]);
      continue;
    }
    if (arg === "--unread") {
      unreadOnly = true;
      continue;
    }
    if (arg.startsWith("--mail-id=")) {
      mailId = arg.slice("--mail-id=".length).trim();
      continue;
    }
    if (arg === "--mail-id") {
      mailId = argv[++i]?.trim();
    }
  }

  return { user, folderId, count, unreadOnly, mailId };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.mailId) {
    const mail = await getNaverWorksMail({
      userId: args.user,
      mailId: args.mailId,
    });
    console.log(JSON.stringify(mail, null, 2));
    return;
  }

  const folders = await listNaverWorksMailFolders({ userId: args.user });
  const list = await listNaverWorksMails({
    userId: args.user,
    folderId: args.folderId,
    count: args.count,
    isUnread: args.unreadOnly,
  });

  console.log(
    JSON.stringify(
      {
        user: args.user || process.env.NAVER_WORKS_MAIL_USER,
        folders: folders.map((folder) => ({
          folderId: folder.folderId,
          folderName: folder.folderName,
          mailCount: folder.mailCount,
          unreadMailCount: folder.unreadMailCount,
        })),
        folderName: list.folderName,
        totalCount: list.totalCount,
        unreadCount: list.unreadCount,
        mails: list.mails.map((mail) => ({
          mailId: mail.mailId,
          status: mail.status,
          subject: mail.subject,
          from: mail.from,
          receivedTime: mail.receivedTime,
          attachCount: mail.attachCount,
        })),
        nextCursor: list.nextCursor ?? null,
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
