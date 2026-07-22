import { getNaverWorksUserAccessToken } from "@/lib/naver-works/user-oauth";

export interface NaverWorksMailSummary {
  mailId: number;
  folderId: number;
  status: string;
  subject: string;
  receivedTime: string;
  sentTime: string;
  from: { name?: string; email: string };
  to: Array<{ name?: string; email: string }>;
  attachCount: number;
  isImportant: boolean;
}

export interface NaverWorksMailFolder {
  folderId: number;
  folderType: "S" | "U";
  folderName: string;
  unreadMailCount: number;
  mailCount: number;
}

export interface NaverWorksMailDetail extends NaverWorksMailSummary {
  body?: string;
  contentType?: string;
}

function resolveMailUserId(explicit?: string): string {
  const value =
    explicit?.trim() ||
    process.env.NAVER_WORKS_MAIL_USER?.trim() ||
    process.env.NAVER_WORKS_MAIL_USERS?.split(",")[0]?.trim();
  if (!value) {
    throw new Error(
      "Mail userId not set. Pass userId or set NAVER_WORKS_MAIL_USER (email or Works userId).",
    );
  }
  return value;
}

async function mailFetch(path: string, userId: string): Promise<Response> {
  const token = await getNaverWorksUserAccessToken();
  const encodedUserId = encodeURIComponent(userId);
  return fetch(`https://www.worksapis.com/v1.0/users/${encodedUserId}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function listNaverWorksMailFolders(options?: {
  userId?: string;
}): Promise<NaverWorksMailFolder[]> {
  const userId = resolveMailUserId(options?.userId);
  const response = await mailFetch("/mail/mailfolders", userId);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `NAVER Works mail folders failed HTTP ${response.status}: ${text || "empty body"}`,
    );
  }
  const data = (await response.json()) as { mailFolders?: NaverWorksMailFolder[] };
  return data.mailFolders ?? [];
}

export async function listNaverWorksMails(options: {
  userId?: string;
  folderId?: number;
  count?: number;
  cursor?: string;
  isUnread?: boolean;
}): Promise<{
  mails: NaverWorksMailSummary[];
  folderName: string;
  totalCount: number;
  unreadCount: number;
  nextCursor?: string;
}> {
  const userId = resolveMailUserId(options.userId);
  const folderId = options.folderId ?? 0;

  const params = new URLSearchParams();
  params.set("count", String(options.count ?? 30));
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.isUnread) params.set("isUnread", "true");

  const query = params.toString();
  const path = `/mail/mailfolders/${folderId}/children${query ? `?${query}` : ""}`;
  const response = await mailFetch(path, userId);

  if (response.status === 204) {
    return {
      mails: [],
      folderName: "",
      totalCount: 0,
      unreadCount: 0,
    };
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `NAVER Works mail list failed HTTP ${response.status}: ${text || "empty body"}`,
    );
  }

  const data = (await response.json()) as {
    mails?: NaverWorksMailSummary[];
    folderName?: string;
    totalCount?: number;
    unreadCount?: number;
    responseMetaData?: { nextCursor?: string };
  };

  return {
    mails: data.mails ?? [],
    folderName: data.folderName ?? "",
    totalCount: data.totalCount ?? 0,
    unreadCount: data.unreadCount ?? 0,
    nextCursor: data.responseMetaData?.nextCursor,
  };
}

export async function getNaverWorksMail(options: {
  userId?: string;
  mailId: number | string;
}): Promise<NaverWorksMailDetail> {
  const userId = resolveMailUserId(options.userId);
  const response = await mailFetch(
    `/mail/${encodeURIComponent(String(options.mailId))}`,
    userId,
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `NAVER Works mail read failed HTTP ${response.status}: ${text || "empty body"}`,
    );
  }

  const data = (await response.json()) as { mail?: NaverWorksMailDetail };
  if (!data.mail) {
    throw new Error("NAVER Works mail read returned empty body");
  }
  return data.mail;
}
