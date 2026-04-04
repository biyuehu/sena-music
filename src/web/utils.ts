export function formatTime(s: number) {
  if (Number.isNaN(s)) return '00:00'
  return `${Math.floor(s / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(s % 60)
    .toString()
    .padStart(2, '0')}`
}
