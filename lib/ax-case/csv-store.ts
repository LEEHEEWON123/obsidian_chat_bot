import { readFile } from "fs/promises";
import path from "path";

import { parse } from "csv-parse/sync";

import { getAxCaseDir } from "@/lib/ax-case/paths";

export type AssetRow = {
  assetId: string;
  fileName: string;
  fileType: string;
  storagePath: string;
  registeredAt: string;
  previewPath: string;
  tags: string[];
  memo: string;
};

export type CampaignRow = {
  campaignId: string;
  name: string;
  brand: string;
  category: string;
  audience: string;
  goal: string;
  conversionMetric: string;
  channel: string;
  startDate: string;
  endDate: string;
};

export type ReviewRow = {
  reviewId: string;
  assetId: string;
  campaignId: string;
  channel: string;
  status: string;
  reason: string;
  action: string;
  reviewedOn: string;
};

export type PerformanceRow = {
  perfId: string;
  assetId: string;
  campaignId: string;
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  spendKrw: number;
  periodStart: string;
  periodEnd: string;
  dataStatus: string;
};

export type AxCaseTables = {
  caseDir: string;
  assets: AssetRow[];
  campaigns: CampaignRow[];
  reviews: ReviewRow[];
  performance: PerformanceRow[];
};

function parseCsv(text: string): Record<string, string>[] {
  const cleaned = text.replace(/^\uFEFF/, "");
  return parse(cleaned, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];
}

function splitTags(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split("|")
    .map((t) => t.trim())
    .filter(Boolean);
}

function num(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function loadAxCaseTables(
  caseDir = getAxCaseDir(),
): Promise<AxCaseTables> {
  const dataDir = path.join(caseDir, "data");
  const [assetsRaw, campaignsRaw, reviewsRaw, perfRaw] = await Promise.all([
    readFile(path.join(dataDir, "assets.csv"), "utf8"),
    readFile(path.join(dataDir, "campaigns.csv"), "utf8"),
    readFile(path.join(dataDir, "review_history.csv"), "utf8"),
    readFile(path.join(dataDir, "performance_sample.csv"), "utf8"),
  ]);

  const assets = parseCsv(assetsRaw).map((row) => ({
    assetId: row["소재번호"] ?? "",
    fileName: row["파일명"] ?? "",
    fileType: row["파일유형"] ?? "",
    storagePath: row["저장경로"] ?? "",
    registeredAt: row["등록일시"] ?? "",
    previewPath: row["미리보기경로"] ?? "",
    tags: splitTags(row["기존태그"] ?? ""),
    memo: row["운영메모"] ?? "",
  }));

  const campaigns = parseCsv(campaignsRaw).map((row) => ({
    campaignId: row["캠페인번호"] ?? "",
    name: row["캠페인명"] ?? "",
    brand: row["브랜드명"] ?? "",
    category: row["상품분류"] ?? "",
    audience: row["대상고객"] ?? "",
    goal: row["광고목표"] ?? "",
    conversionMetric: row["전환기준"] ?? "",
    channel: row["매체"] ?? "",
    startDate: row["시작일"] ?? "",
    endDate: row["종료일"] ?? "",
  }));

  const reviews = parseCsv(reviewsRaw).map((row) => ({
    reviewId: row["심사번호"] ?? "",
    assetId: row["소재번호"] ?? "",
    campaignId: row["캠페인번호"] ?? "",
    channel: row["매체"] ?? "",
    status: row["심사상태"] ?? "",
    reason: row["반려·확인사유"] ?? "",
    action: row["조치내용"] ?? "",
    reviewedOn: row["심사일"] ?? "",
  }));

  const performance = parseCsv(perfRaw).map((row) => ({
    perfId: row["성과번호"] ?? "",
    assetId: row["소재번호"] ?? "",
    campaignId: row["캠페인번호"] ?? "",
    impressions: num(row["노출수"] ?? ""),
    clicks: num(row["클릭수"] ?? ""),
    ctr: num(row["클릭률"] ?? ""),
    conversions: num(row["전환수"] ?? ""),
    spendKrw: num(row["광고비(원)"] ?? ""),
    periodStart: row["집계시작일"] ?? "",
    periodEnd: row["집계종료일"] ?? "",
    dataStatus: row["데이터상태"] ?? "",
  }));

  return { caseDir, assets, campaigns, reviews, performance };
}
