import { requestUrl } from 'obsidian';
import type { Company, SourceIssue } from './types';
import { runTasks, sourceConcurrency } from './task-runner';
import type { InvestSettings } from './types';
import { capitalizationUrl, parseIssueCapitalization } from './moex-company-market-data';
import type { IssueCapitalization } from './moex-company-market-data';

export async function fetchIssueCapitalization(ticker: string): Promise<IssueCapitalization | undefined> {
  const url = capitalizationUrl(ticker);
  const response = await requestUrl({ url, method: 'GET', throw: false });
  if (response.status !== 200) throw new Error(`Мосбиржа вернула HTTP ${response.status}`);
  return parseIssueCapitalization(response.json, ticker, url);
}

export async function companyCapitalizations(companies: Company[], settings: InvestSettings): Promise<{ values: (IssueCapitalization | undefined)[]; issues: SourceIssue[] }> {
  const values = await runTasks(companies.map((company) => async () => {
    try { return { company, value: await fetchIssueCapitalization(company.ticker) }; }
    catch (error) { return { company, error: error instanceof Error ? error.message : 'ошибка ISS' }; }
  }), sourceConcurrency(settings.llmProvider));
  const issues: SourceIssue[] = [];
  for (const { company, value, error } of values) {
    if (error || !value) issues.push({ source: `${company.name} · Мосбиржа`, message: error ?? 'нет данных о капитализации выпуска' });
  }
  return { values: values.map(({ value }) => value), issues };
}
