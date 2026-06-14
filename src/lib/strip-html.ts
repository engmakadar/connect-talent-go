/**
 * Strip HTML tags and collapse whitespace to keep the database clean text only.
 * Decodes the most common entities so saved content reads naturally.
 */
export function stripHtml(input: string | null | undefined): string {
  if (!input) return "";
  let text = String(input)
    // remove script/style blocks entirely
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    // line breaks for block-level closes
    .replace(/<\/(p|div|li|h[1-6]|tr|br)\s*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    // remove remaining tags
    .replace(/<[^>]+>/g, "");
  // decode a few common entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  // collapse runs of whitespace per line, then trim
  return text
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l, i, arr) => !(l === "" && arr[i - 1] === ""))
    .join("\n")
    .trim();
}

export function wordCount(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}
