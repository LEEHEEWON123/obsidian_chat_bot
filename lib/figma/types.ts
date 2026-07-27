/** Minimal Figma node fields we care about for export/fingerprint. */
export type FigmaNode = {
  id: string;
  name: string;
  type: string;
  characters?: string;
  fills?: unknown[];
  strokes?: unknown[];
  absoluteBoundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  layoutMode?: string;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  children?: FigmaNode[];
  style?: {
    fontSize?: number;
    fontWeight?: number;
  };
};

export type FigmaNodesResponse = {
  name?: string;
  lastModified?: string;
  version?: string;
  nodes: Record<
    string,
    {
      document: FigmaNode;
      components?: Record<string, unknown>;
    } | null
  >;
};

export type FigmaImagesResponse = {
  err?: string;
  images: Record<string, string | null>;
};

export type ParsedFigmaTarget = {
  fileKey: string;
  nodeId: string;
  url?: string;
};

export type FigmaSnapshotMeta = {
  fileKey: string;
  nodeId: string;
  name: string;
  figmaVersion?: string;
  lastModified?: string;
  exportedAt: string;
  fingerprint: string;
  treeSummary: {
    nodeCount: number;
    textCount: number;
    componentCount: number;
  };
  previewPath?: string;
  url?: string;
};

export type FigmaChange =
  | { kind: "created" }
  | { kind: "unchanged" }
  | {
      kind: "updated";
      added: string[];
      removed: string[];
      renamed: Array<{ from: string; to: string; id: string }>;
      textChanged: Array<{ id: string; name: string; before: string; after: string }>;
      layoutChanged: Array<{ id: string; name: string; detail: string }>;
      other: string[];
    };
