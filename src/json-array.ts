/** Read the first valid JSON array from a model response with optional prose around it. */
export function firstJsonArray(response: string): unknown[] {
  for (let start = response.indexOf('['); start >= 0; start = response.indexOf('[', start + 1)) {
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let end = start; end < response.length; end++) {
      const char = response[end];
      if (escaped) { escaped = false; continue; }
      if (char === '\\' && quoted) { escaped = true; continue; }
      if (char === '"') { quoted = !quoted; continue; }
      if (quoted) continue;
      if (char === '[') depth++;
      if (char === ']' && --depth === 0) {
        try {
          const json = response.slice(start, end + 1).replace(/("topic"\s*:\s*)None(?=\s*[,}])/g, '$1null');
          const parsed: unknown = JSON.parse(json);
          if (Array.isArray(parsed)) return parsed;
        } catch { break; }
      }
    }
  }
  throw new Error('Модель не вернула корректный JSON-список');
}
