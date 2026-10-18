import type { Company } from './types';

// Defaults are intentionally small. Other companies can set their exact logo
// colour in the optional Markdown column without a plugin release.
const DEFAULT_BRAND_COLORS: Readonly<Record<string, string>> = {
  SBER: '#21A038',
  SBERP: '#21A038',
  LKOH: '#D71920',
  SIBN: '#0077C8',
  PHOR: '#1479B8',
  ROSN: '#E7B929',
  PLZL: '#C99B32',
  MOEX: '#D62732',
  BELU: '#305885',
  MDMG: '#28A5A0',
};

export function validBrandColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

export function companyBrandColor(company: Pick<Company, 'ticker' | 'color'>): string | undefined {
  const configured = company.color?.trim();
  if (configured && validBrandColor(configured)) return configured.toUpperCase();
  return DEFAULT_BRAND_COLORS[company.ticker.toUpperCase()];
}

export function companyCalloutType(color: string | undefined): string {
  return color && validBrandColor(color) ? `invest-company-${color.trim().slice(1).toLowerCase()}` : 'invest-company';
}

/** Apply the colour encoded in a custom callout type to a rendered report. */
export function applyCompanyCardColors(root: HTMLElement): void {
  const selector = '.callout[data-callout^="invest-company-"]';
  const cards = [...(root.matches(selector) ? [root] : []),
    ...Array.from(root.querySelectorAll<HTMLElement>(selector))];
  for (const card of cards) {
    const match = /^invest-company-([0-9a-f]{6})$/.exec(card.dataset.callout ?? '');
    if (match) card.style.setProperty('--invest-company-accent', `#${match[1]}`);
  }
}
