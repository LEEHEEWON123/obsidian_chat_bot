import {
  loadAxCaseTables,
  type AssetRow,
  type AxCaseTables,
  type CampaignRow,
  type PerformanceRow,
  type ReviewRow,
} from "@/lib/ax-case/csv-store";

export type PerfMetric = "ctr" | "conversions" | "clicks" | "spend" | "cpa";

export type AssetQueryInput = {
  operation:
    | "list_tables"
    | "top_performers"
    | "filter_assets"
    | "asset_detail";
  metric?: PerfMetric;
  limit?: number;
  brand?: string;
  campaignId?: string;
  assetId?: string;
  fileType?: string;
  reviewStatus?: string;
  tagContains?: string;
  periodFrom?: string;
  periodTo?: string;
  confirmedOnly?: boolean;
};

export type AssetPerfSummary = {
  assetId: string;
  fileName: string;
  fileType: string;
  previewPath: string;
  tags: string[];
  memo: string;
  impressions: number;
  clicks: number;
  conversions: number;
  spendKrw: number;
  ctr: number;
  cpa: number | null;
  campaigns: string[];
  brands: string[];
  latestReviewStatuses: string[];
};

function overlapsPeriod(
  row: PerformanceRow,
  from?: string,
  to?: string,
): boolean {
  if (from && row.periodEnd < from) return false;
  if (to && row.periodStart > to) return false;
  return true;
}

function campaignById(tables: AxCaseTables): Map<string, CampaignRow> {
  return new Map(tables.campaigns.map((c) => [c.campaignId, c]));
}

function assetById(tables: AxCaseTables): Map<string, AssetRow> {
  return new Map(tables.assets.map((a) => [a.assetId, a]));
}

function latestReviewsByAsset(tables: AxCaseTables): Map<string, ReviewRow[]> {
  const map = new Map<string, ReviewRow[]>();
  for (const review of tables.reviews) {
    const list = map.get(review.assetId) ?? [];
    list.push(review);
    map.set(review.assetId, list);
  }
  for (const [id, list] of map) {
    list.sort((a, b) => a.reviewedOn.localeCompare(b.reviewedOn));
    map.set(id, list);
  }
  return map;
}

function aggregatePerformance(
  tables: AxCaseTables,
  options: {
    periodFrom?: string;
    periodTo?: string;
    confirmedOnly?: boolean;
    brand?: string;
    campaignId?: string;
  },
): AssetPerfSummary[] {
  const campaigns = campaignById(tables);
  const assets = assetById(tables);
  const reviews = latestReviewsByAsset(tables);
  const brandNeedle = options.brand?.trim().toLowerCase();

  type Agg = {
    impressions: number;
    clicks: number;
    conversions: number;
    spendKrw: number;
    campaignIds: Set<string>;
  };
  const agg = new Map<string, Agg>();

  for (const row of tables.performance) {
    if (options.confirmedOnly && row.dataStatus !== "확정") continue;
    if (!overlapsPeriod(row, options.periodFrom, options.periodTo)) continue;
    if (options.campaignId && row.campaignId !== options.campaignId) continue;

    const campaign = campaigns.get(row.campaignId);
    if (
      brandNeedle &&
      !(campaign?.brand ?? "").toLowerCase().includes(brandNeedle)
    ) {
      continue;
    }

    const cur = agg.get(row.assetId) ?? {
      impressions: 0,
      clicks: 0,
      conversions: 0,
      spendKrw: 0,
      campaignIds: new Set<string>(),
    };
    cur.impressions += row.impressions;
    cur.clicks += row.clicks;
    cur.conversions += row.conversions;
    cur.spendKrw += row.spendKrw;
    cur.campaignIds.add(row.campaignId);
    agg.set(row.assetId, cur);
  }

  const out: AssetPerfSummary[] = [];
  for (const [assetId, stats] of agg) {
    const asset = assets.get(assetId);
    if (!asset) continue;
    const brands = [...stats.campaignIds]
      .map((id) => campaigns.get(id)?.brand)
      .filter((b): b is string => Boolean(b));
    const ctr =
      stats.impressions > 0 ? stats.clicks / stats.impressions : 0;
    const cpa =
      stats.conversions > 0 ? stats.spendKrw / stats.conversions : null;
    const assetReviews = reviews.get(assetId) ?? [];
    out.push({
      assetId,
      fileName: asset.fileName,
      fileType: asset.fileType,
      previewPath: asset.previewPath,
      tags: asset.tags,
      memo: asset.memo,
      impressions: stats.impressions,
      clicks: stats.clicks,
      conversions: stats.conversions,
      spendKrw: stats.spendKrw,
      ctr,
      cpa,
      campaigns: [...stats.campaignIds],
      brands: [...new Set(brands)],
      latestReviewStatuses: assetReviews.map(
        (r) => `${r.channel}:${r.status}`,
      ),
    });
  }
  return out;
}

function metricValue(row: AssetPerfSummary, metric: PerfMetric): number {
  switch (metric) {
    case "ctr":
      return row.ctr;
    case "conversions":
      return row.conversions;
    case "clicks":
      return row.clicks;
    case "spend":
      return row.spendKrw;
    case "cpa":
      return row.cpa == null ? Number.POSITIVE_INFINITY : row.cpa;
    default:
      return row.conversions;
  }
}

function filterAssets(
  tables: AxCaseTables,
  options: {
    brand?: string;
    campaignId?: string;
    fileType?: string;
    reviewStatus?: string;
    tagContains?: string;
  },
) {
  const campaigns = campaignById(tables);
  const reviews = latestReviewsByAsset(tables);
  const brandNeedle = options.brand?.trim().toLowerCase();
  const tagNeedle = options.tagContains?.trim().toLowerCase();
  const statusNeedle = options.reviewStatus?.trim().toLowerCase();

  const campaignAssetIds = new Set<string>();
  if (options.campaignId || brandNeedle) {
    for (const review of tables.reviews) {
      if (options.campaignId && review.campaignId !== options.campaignId) {
        continue;
      }
      const campaign = campaigns.get(review.campaignId);
      if (
        brandNeedle &&
        !(campaign?.brand ?? "").toLowerCase().includes(brandNeedle)
      ) {
        continue;
      }
      campaignAssetIds.add(review.assetId);
    }
    for (const perf of tables.performance) {
      if (options.campaignId && perf.campaignId !== options.campaignId) {
        continue;
      }
      const campaign = campaigns.get(perf.campaignId);
      if (
        brandNeedle &&
        !(campaign?.brand ?? "").toLowerCase().includes(brandNeedle)
      ) {
        continue;
      }
      campaignAssetIds.add(perf.assetId);
    }
  }

  return tables.assets.filter((asset) => {
    if (options.fileType && asset.fileType !== options.fileType) return false;
    if (tagNeedle) {
      const hay = `${asset.tags.join(" ")} ${asset.memo} ${asset.fileName}`.toLowerCase();
      if (!hay.includes(tagNeedle)) return false;
    }
    if (options.campaignId || brandNeedle) {
      if (!campaignAssetIds.has(asset.assetId)) return false;
    }
    if (statusNeedle) {
      const list = reviews.get(asset.assetId) ?? [];
      if (!list.some((r) => r.status.toLowerCase() === statusNeedle)) {
        return false;
      }
    }
    return true;
  });
}

export async function runAssetQuery(input: AssetQueryInput): Promise<unknown> {
  const tables = await loadAxCaseTables();
  const limit = Math.min(Math.max(input.limit ?? 5, 1), 50);

  if (input.operation === "list_tables") {
    return {
      caseDir: tables.caseDir,
      counts: {
        assets: tables.assets.length,
        campaigns: tables.campaigns.length,
        reviews: tables.reviews.length,
        performance: tables.performance.length,
      },
      joinKeys: ["assetId (소재번호)", "campaignId (캠페인번호)"],
      operations: [
        "list_tables",
        "top_performers",
        "filter_assets",
        "asset_detail",
      ],
      metrics: ["ctr", "conversions", "clicks", "spend", "cpa"],
    };
  }

  if (input.operation === "asset_detail") {
    const assetId = input.assetId?.trim();
    if (!assetId) throw new Error("assetId is required for asset_detail");
    const asset = tables.assets.find((a) => a.assetId === assetId);
    if (!asset) throw new Error(`Unknown assetId: ${assetId}`);
    return {
      asset,
      reviews: tables.reviews.filter((r) => r.assetId === assetId),
      performance: tables.performance.filter((p) => p.assetId === assetId),
      campaigns: tables.campaigns.filter((c) =>
        tables.reviews.some(
          (r) => r.assetId === assetId && r.campaignId === c.campaignId,
        ) ||
        tables.performance.some(
          (p) => p.assetId === assetId && p.campaignId === c.campaignId,
        ),
      ),
    };
  }

  if (input.operation === "filter_assets") {
    const assets = filterAssets(tables, input).slice(0, limit);
    return {
      operation: "filter_assets",
      count: assets.length,
      assets,
    };
  }

  // top_performers (default)
  const metric = input.metric ?? "conversions";
  const rows = aggregatePerformance(tables, {
    periodFrom: input.periodFrom,
    periodTo: input.periodTo,
    confirmedOnly: input.confirmedOnly ?? true,
    brand: input.brand,
    campaignId: input.campaignId,
  });

  const ascending = metric === "cpa";
  rows.sort((a, b) => {
    const av = metricValue(a, metric);
    const bv = metricValue(b, metric);
    return ascending ? av - bv : bv - av;
  });

  return {
    operation: "top_performers",
    metric,
    confirmedOnly: input.confirmedOnly ?? true,
    count: Math.min(limit, rows.length),
    results: rows.slice(0, limit),
  };
}
