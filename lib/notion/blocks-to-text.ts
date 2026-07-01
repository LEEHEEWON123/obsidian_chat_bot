import type {
  BlockObjectResponse,
  RichTextItemResponse,
} from "@notionhq/client/build/src/api-endpoints";

function plainText(richText: RichTextItemResponse[]): string {
  return richText.map((item) => item.plain_text).join("");
}

function blockToLine(block: BlockObjectResponse): string {
  switch (block.type) {
    case "paragraph":
      return plainText(block.paragraph.rich_text);
    case "heading_1":
      return `# ${plainText(block.heading_1.rich_text)}`;
    case "heading_2":
      return `## ${plainText(block.heading_2.rich_text)}`;
    case "heading_3":
      return `### ${plainText(block.heading_3.rich_text)}`;
    case "bulleted_list_item":
      return `- ${plainText(block.bulleted_list_item.rich_text)}`;
    case "numbered_list_item":
      return `- ${plainText(block.numbered_list_item.rich_text)}`;
    case "to_do": {
      const checked = block.to_do.checked ? "x" : " ";
      return `- [${checked}] ${plainText(block.to_do.rich_text)}`;
    }
    case "quote":
      return `> ${plainText(block.quote.rich_text)}`;
    case "callout":
      return plainText(block.callout.rich_text);
    case "code":
      return `\`\`\`\n${plainText(block.code.rich_text)}\n\`\`\``;
    case "divider":
      return "---";
    case "bookmark":
      return block.bookmark.url ?? "";
    case "equation":
      return block.equation.expression;
    case "toggle":
      return plainText(block.toggle.rich_text);
    default:
      return "";
  }
}

export function blocksToText(blocks: BlockObjectResponse[]): string {
  return blocks
    .map(blockToLine)
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

export function extractChildPageIds(blocks: BlockObjectResponse[]): string[] {
  const ids: string[] = [];

  for (const block of blocks) {
    if (block.type === "child_page") {
      ids.push(block.id.replace(/-/g, ""));
    }
    if (block.type === "child_database") {
      ids.push(block.id.replace(/-/g, ""));
    }
  }

  return ids;
}

export function extractLinkedPageIds(blocks: BlockObjectResponse[]): string[] {
  const ids: string[] = [];

  for (const block of blocks) {
    if (block.type !== "link_to_page") continue;

    const target = block.link_to_page;
    if (target.type === "page_id") {
      ids.push(target.page_id.replace(/-/g, ""));
    }
  }

  return ids;
}
