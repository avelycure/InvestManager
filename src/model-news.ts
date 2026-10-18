import type { SelectedNews } from './types';

export function modelEligibleNews(items: SelectedNews[], includeTelegram = false): SelectedNews[] {
  return includeTelegram ? items : items.filter((item) => !item.channel);
}
