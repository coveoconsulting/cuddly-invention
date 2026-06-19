export function toLocalIsoDate(date = new Date()) {
  const localDate = new Date(date);
  localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
  return localDate.toISOString().slice(0, 10);
}

export function addDaysIso(days: number, base = new Date()) {
  const nextDate = new Date(base);
  nextDate.setDate(nextDate.getDate() + days);
  return toLocalIsoDate(nextDate);
}
