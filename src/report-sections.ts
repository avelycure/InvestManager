/** Each run stays in the daily note; only the newest copy of an unchanged chart is embedded. */
export function linkPreviousChartEmbeds(markdown: string, chartPath: string): string {
  const embed = `![[${chartPath}|840]]`;
  const link = `[[${chartPath}|Открыть график IMOEX]]`;
  return markdown.replaceAll(embed, link);
}

/** A newly appended interactive index chart takes the place of older SVG embeds. */
export function retirePreviousImoexCharts(markdown: string): string {
  return markdown
    .replace(/!\[\[(Статистика\/\d{4}\/[^\]\n]+\/IMOEX-\d{8}-[0-9a-f]{8}\.svg)\|840\]\]/g,
      (_embed, path: string) => `[[${path}|Открыть график IMOEX]]`)
    .replace(/^```invest-manager-imoex\n[\s\S]*?\n```$/gm, '_График индекса показан в последнем отчёте ниже._');
}

/** Upgrade the latest saved SVG chart without regenerating the rest of its report. */
export function upgradeLatestImoexChart(markdown: string, codeBlock: string): string {
  const legacy = /^#### 📈 Индекс Мосбиржи · 30 дней\n\n!\[\[Статистика\/\d{4}\/[^\]\n]+\/IMOEX-[^\]\n]+\.svg\|840\]\](?:\n\nДневные значения закрытия · [^\n]*)?/gm;
  let last: RegExpExecArray | null = null;
  for (const match of markdown.matchAll(legacy)) last = match;
  if (!last || last.index === undefined) return markdown;
  return `${retirePreviousImoexCharts(markdown.slice(0, last.index))}${codeBlock}${retirePreviousImoexCharts(markdown.slice(last.index + last[0].length))}`;
}

/** Older runs keep their news, while only the newest run loads stock charts. */
export function retirePreviousStockCharts(markdown: string): string {
  return markdown.replace(/^```invest-manager-stock\n[A-Z0-9._-]{1,24}(?:\n\d{4}-\d\d-\d\dT[^\n]+)?\n```$/gm, '_График акции показан в последнем отчёте ниже._');
}

/** Keep the newest visible price chart for each ticker across repeated daily runs. */
export function linkPreviousStockReportEmbeds(markdown: string, tickers: ReadonlySet<string>): string {
  return markdown.replace(/!\[\[(Статистика\/\d{4}\/[^/\]\n]+\/STOCK-([A-Z0-9._-]{1,24})-\d{8}-[0-9a-f]{8}\.svg)\|840\]\]/g,
    (embed, path: string, ticker: string) => tickers.has(ticker) ? `[[${path}|Открыть график ${ticker}]]` : embed);
}

/** Remove obsolete P/E placeholders from reports created before price charts replaced them. */
export function removeLegacyPeRows(markdown: string): string {
  return markdown
    .replace(/^P\/E не рассчитан: нужны капитализация всей компании и сопоставимая годовая прибыль\.\n?/gm, '')
    .replace(/^\| P\/E \| Не рассчитан \| — \|\n?/gm, '');
}

/** Hide the retired IFRS blocks from earlier runs in the same daily note. */
export function removeLegacyIfrsSections(markdown: string): string {
  const lines = markdown.split('\n');
  const kept: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (/^#### МСФО(?: ·|$)/u.test(line)) { skipping = true; continue; }
    if (skipping && /^#{2,4} /u.test(line)) skipping = false;
    if (!skipping) kept.push(line);
  }
  return kept.join('\n').replace(/\n{3,}/gu, '\n\n');
}

/** Standalone company metrics reports have been merged into the daily digest. */
export function removeStandaloneCompanyMetrics(markdown: string): string {
  return markdown.replace(/^## Показатели компаний[^\n]*\n[\s\S]*?(?=^## |$(?![\s\S]))/gm, '').replace(/\n{3,}/gu, '\n\n').trim();
}

export function latestReportSection(markdown: string): string {
  const heading = /^## 📊 Инвестиционная статистика(?=\s|$)/gm;
  let start = -1;
  for (const match of markdown.matchAll(heading)) start = match.index;
  return start >= 0 ? markdown.slice(start).trim() : markdown.trim();
}
