export interface Company {
  name: string;
  ticker: string;
  color?: string;
  investors?: string;
  news?: string;
}

export interface Topic {
  name: string;
  keywords: string[];
}

export interface Channel {
  name: string;
  username: string;
}

export interface Publication {
  name: string;
  url: string;
}

export interface ConfigFiles {
  companies: Company[];
  topics: Topic[];
  channels: Channel[];
  publications: Publication[];
}

export type TelegramProvider = 'mtproto' | 'public-web' | 'off';
export type BrentProvider = 'eia' | 'moex' | 'off';
export type RateProvider = 'cbr' | 'off';
export type GoldProvider = 'moex' | 'off';
export type ImoexProvider = 'moex' | 'off';
export type LlmProvider = 'local' | 'cloud';
export type CompanyBrowserMode = 'fallback' | 'off';

export interface InvestSettings {
  companiesPath: string;
  topicsPath: string;
  channelsPath: string;
  publicationsPath: string;
  companyBrowserMode: CompanyBrowserMode;
  outputFolder: string;
  digestReadyTime: string;
  telegramProvider: TelegramProvider;
  telegramApiId: string;
  telegramApiHashSecretId: string;
  telegramLlmEnabled: boolean;
  brentProvider: BrentProvider;
  eiaSecretId: string;
  eiaApiKey: string;
  usdProvider: RateProvider;
  cnyProvider: RateProvider;
  goldProvider: GoldProvider;
  imoexProvider: ImoexProvider;
  llmProvider: LlmProvider;
  localLlmUrl: string;
  localLlmModel: string;
  cloudLlmUrl: string;
  cloudLlmModel: string;
  cloudLlmSecretId: string;
  cloudLlmApiKey: string;
  ragEnabled: boolean;
  allowCloudVaultContext: boolean;
  lastAutomaticDate: string;
  lastDigest?: SavedDigest;
}

export const DEFAULT_SETTINGS: InvestSettings = {
  companiesPath: '',
  topicsPath: '',
  channelsPath: '',
  publicationsPath: '',
  companyBrowserMode: 'fallback',
  outputFolder: 'Статистика',
  digestReadyTime: '09:00',
  telegramProvider: 'public-web',
  telegramApiId: '',
  telegramApiHashSecretId: '',
  telegramLlmEnabled: false,
  brentProvider: 'moex',
  eiaSecretId: '',
  eiaApiKey: '',
  usdProvider: 'cbr',
  cnyProvider: 'cbr',
  goldProvider: 'moex',
  imoexProvider: 'moex',
  llmProvider: 'local',
  localLlmUrl: 'http://127.0.0.1:11434/v1',
  localLlmModel: '',
  cloudLlmUrl: 'https://api.openai.com/v1',
  cloudLlmModel: 'gpt-5.4-mini',
  cloudLlmSecretId: '',
  cloudLlmApiKey: '',
  ragEnabled: false,
  allowCloudVaultContext: false,
  lastAutomaticDate: '',
};

export interface NewsItem {
  title: string;
  text: string;
  url: string;
  source: string;
  feedUrl?: string;
  publishedAt: Date;
  channel?: boolean;
  companySource?: string;
  publishedTimeKnown?: boolean;
}

export interface SelectedNews extends NewsItem {
  category: 'world' | 'company';
  company?: string;
  reason: string;
  topic?: string;
  titleRu?: string;
  summary?: string;
  relatedSources?: Array<{ source: string; url: string }>;
}

export type NewsRating = 'helpful' | 'off-topic' | 'not-interesting';

export interface NewsFeedback {
  url: string;
  title: string;
  source: string;
  topic?: string;
  rating?: NewsRating;
  ratedAt?: string;
  readAt?: string;
}

export interface DataPoint {
  label: string;
  value: string;
  asOf: string;
  source: string;
  url: string;
  change?: { amount: number; unit: string; decimals: number };
}

export interface IndexSeries {
  points: Array<{ date: string; close: number }>;
  sourceUrl: string;
}

export interface SourceIssue {
  source: string;
  message: string;
}

export interface RelatedNotes {
  companies: Record<string, string[]>;
  topics: Record<string, string[]>;
  events?: Record<string, string[]>;
}

export interface DigestResult {
  windowStart: Date;
  windowEnd: Date;
  generatedAt: Date;
  world: SelectedNews[];
  companies: SelectedNews[];
  companyNews?: Array<{ company: string; ticker?: string; press: SelectedNews[]; news: SelectedNews[] }>;
  companyCapitalizations?: Record<string, { valueRub: number; url: string }>;
  relatedNotes?: RelatedNotes;
  worldBackfill?: Array<{ topic: string; items: SelectedNews[] }>;
  market: DataPoint[];
  imoex?: IndexSeries;
  issues: SourceIssue[];
  checkedSources: number;
  matchedCount?: number;
  reportPath?: string;
}

export interface SavedDigest {
  windowStart: string;
  windowEnd: string;
  generatedAt: string;
  world: Array<Omit<SelectedNews, 'publishedAt'> & { publishedAt: string }>;
  companies: Array<Omit<SelectedNews, 'publishedAt'> & { publishedAt: string }>;
  companyNews?: Array<{ company: string; ticker?: string; press: Array<Omit<SelectedNews, 'publishedAt'> & { publishedAt: string }>;
    news: Array<Omit<SelectedNews, 'publishedAt'> & { publishedAt: string }> }>;
  companyCapitalizations?: Record<string, { valueRub: number; url: string }>;
  relatedNotes?: RelatedNotes;
  worldBackfill?: Array<{ topic: string; items: Array<Omit<SelectedNews, 'publishedAt'> & { publishedAt: string }> }>;
  market: DataPoint[];
  imoex?: IndexSeries;
  issues: SourceIssue[];
  checkedSources: number;
  matchedCount?: number;
  reportPath: string;
}
