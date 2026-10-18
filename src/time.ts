export function moscowDateKey(date: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

export function moscowHourMinute(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

export function moscowStamp(date: Date): string {
  return `${moscowDateKey(date)} ${moscowHourMinute(date)} МСК`;
}

export function dailyTime(dateKey: string, time: string): Date {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Укажите время в формате ЧЧ:ММ');
  return new Date(`${dateKey}T${time}:00+03:00`);
}

export function preparationTime(time: string): string {
  const target = dailyTime('2026-01-02', time);
  return moscowHourMinute(new Date(target.getTime() - 30 * 60_000));
}

export function morningWindow(dateKey: string, time = '09:00'): { start: Date; end: Date } {
  const end = dailyTime(dateKey, time);
  return { start: new Date(end.getTime() - 24 * 60 * 60 * 1000), end };
}

export interface ScheduledDigest {
  dateKey: string;
  phase: 'prepare' | 'run';
}

export function dueDigest(now: Date, time: string, lastAutomaticDate: string): ScheduledDigest | null {
  const today = moscowDateKey(now);
  const targetToday = dailyTime(today, time);
  const prepareToday = new Date(targetToday.getTime() - 30 * 60_000);
  if (lastAutomaticDate !== today && now >= prepareToday) {
    return { dateKey: today, phase: now < targetToday ? 'prepare' : 'run' };
  }
  const tomorrow = moscowDateKey(new Date(targetToday.getTime() + 24 * 60 * 60_000));
  const targetTomorrow = dailyTime(tomorrow, time);
  const prepareTomorrow = new Date(targetTomorrow.getTime() - 30 * 60_000);
  if (lastAutomaticDate === today && now >= prepareTomorrow && now < targetTomorrow) {
    return { dateKey: tomorrow, phase: 'prepare' };
  }
  return null;
}

export function recentWindow(now: Date): { start: Date; end: Date } {
  return { start: new Date(now.getTime() - 24 * 60 * 60 * 1000), end: now };
}

/** Six calendar months, retaining the time and clamping short months. */
export function sixMonthsBefore(end: Date): Date {
  const year = end.getUTCFullYear();
  const month = end.getUTCMonth() - 6;
  const day = end.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const result = new Date(end.getTime());
  result.setUTCFullYear(year, month, Math.min(day, lastDay));
  return result;
}

export function afterMoscowTime(date: Date, hour: number, minute = 0): boolean {
  const [currentHour = 0, currentMinute = 0] = moscowHourMinute(date).split(':').map(Number);
  return currentHour > hour || (currentHour === hour && currentMinute >= minute);
}
