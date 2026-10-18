/** Prefer the response body over Content-Type: some feeds send XML with an HTML header. */
export function isHtmlFeedResponse(body: string, headers: Record<string, string>): boolean {
  const contentType = Object.entries(headers).find(([key]) => key.toLowerCase() === 'content-type')?.[1]?.toLowerCase() ?? '';
  const beginning = body.replace(/^\uFEFF/, '').trimStart();
  if (/^(?:<\?xml\b|<(?:rss|feed|rdf:RDF)\b)/i.test(beginning)) return false;
  return contentType.includes('text/html') || /^(?:<!doctype\s+html|<html\b|<head\b|<body\b)/i.test(beginning);
}
