/** Parse YYYY-MM-DD from queries like 2026/06/24, 2026-06-24 */
export function extractDatesFromQuery(query: string): string[] {
  const dates = new Set<string>();

  for (const match of query.matchAll(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/g)) {
    const year = match[1];
    const month = match[2].padStart(2, "0");
    const day = match[3].padStart(2, "0");
    dates.add(`${year}-${month}-${day}`);
  }

  return [...dates];
}
