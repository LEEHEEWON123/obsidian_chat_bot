import type {
  PageObjectResponse,
  RichTextItemResponse,
} from "@notionhq/client/build/src/api-endpoints";

function richTextToPlain(richText: RichTextItemResponse[]): string {
  return richText.map((item) => item.plain_text).join("");
}

function propertyToText(name: string, property: PageObjectResponse["properties"][string]): string | null {
  switch (property.type) {
    case "title":
      return richTextToPlain(property.title);
    case "rich_text":
      return richTextToPlain(property.rich_text);
    case "number":
      return property.number != null ? String(property.number) : null;
    case "select":
      return property.select?.name ?? null;
    case "multi_select":
      return property.multi_select.map((item) => item.name).join(", ") || null;
    case "date": {
      const start = property.date?.start;
      const end = property.date?.end;
      if (!start) return null;
      return end ? `${start} ~ ${end}` : start;
    }
    case "url":
      return property.url;
    case "email":
      return property.email;
    case "phone_number":
      return property.phone_number;
    case "checkbox":
      return property.checkbox ? "true" : "false";
    case "status":
      return property.status?.name ?? null;
    default:
      return null;
  }
}

export function propertiesToText(
  properties: PageObjectResponse["properties"],
): string {
  const lines: string[] = [];

  for (const [name, property] of Object.entries(properties)) {
    const value = propertyToText(name, property);
    if (value?.trim()) {
      lines.push(`## ${name}\n${value.trim()}`);
    }
  }

  return lines.join("\n\n");
}

export function extractPageTitle(
  properties: PageObjectResponse["properties"],
): string {
  for (const property of Object.values(properties)) {
    if (property.type === "title") {
      const title = richTextToPlain(property.title);
      if (title.trim()) return title;
    }
  }

  for (const [name, property] of Object.entries(properties)) {
    if (property.type === "date" && property.date?.start) {
      return `${property.date.start} ${name}`;
    }
  }

  return "Untitled";
}
