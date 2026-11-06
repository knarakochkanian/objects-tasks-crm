export function formatDate(value: string, withTime = true): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? ({ hour: '2-digit', minute: '2-digit' } as const) : {}),
  }).format(new Date(value));
}
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}
export function taskCount(count: number): string {
  const n = count % 100;
  const ending =
    n >= 11 && n <= 14
      ? 'задач'
      : count % 10 === 1
        ? 'задача'
        : count % 10 >= 2 && count % 10 <= 4
          ? 'задачи'
          : 'задач';
  return `${count} ${ending}`;
}
