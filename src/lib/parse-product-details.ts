export interface DetailEntry {
  label: string;
  value: string;
}

export interface DetailGroup {
  heading: string;
  entries: DetailEntry[];
  lines: string[];
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

function stripHtmlTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, "")).trim();
}

function parseInfoBlock(blockHtml: string): DetailGroup | null {
  const headingMatch = blockHtml.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i);
  if (!headingMatch) return null;

  const heading = stripHtmlTags(headingMatch[1]);
  const body = blockHtml.slice(headingMatch.index! + headingMatch[0].length);

  const entries: DetailEntry[] = [];
  const lines: string[] = [];

  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let pMatch;
  while ((pMatch = pRegex.exec(body)) !== null) {
    const content = pMatch[1].trim();
    const labeled = content.match(/^<strong>([^<]+?):<\/strong>\s*([\s\S]*)$/i);
    if (labeled) {
      const label = labeled[1].trim();
      const value = stripHtmlTags(labeled[2]);
      if (value) {
        entries.push({ label, value });
      } else {
        lines.push(`${label}:`);
      }
      continue;
    }

    const plain = stripHtmlTags(content);
    if (plain) lines.push(plain);
  }

  if (!heading || (!entries.length && !lines.length)) return null;
  return { heading, entries, lines };
}

export function parseDetails(html: string): DetailGroup[] {
  if (!html?.includes("info-grid")) return [];

  const groups: DetailGroup[] = [];
  const gridRegex = /<section class="info-grid">([\s\S]*?)<\/section>/gi;
  let gridMatch;

  while ((gridMatch = gridRegex.exec(html)) !== null) {
    const blockRegex = /<div class="info-block">([\s\S]*?)<\/div>/gi;
    let blockMatch;
    while ((blockMatch = blockRegex.exec(gridMatch[1])) !== null) {
      const group = parseInfoBlock(blockMatch[1]);
      if (group) groups.push(group);
    }
  }

  return groups;
}

export function stripInfoGrids(html: string): string {
  return html.replace(/<section class="info-grid">[\s\S]*?<\/section>/g, "");
}
