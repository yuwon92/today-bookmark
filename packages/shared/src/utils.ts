export function getDomain(url: string): string {
  try { return new URL(url).hostname } catch { return url }
}

export function pickRandom<T extends { id: string }>(list: T[], excludeId?: string): T | null {
  if (list.length === 0) return null
  const candidates = excludeId && list.length > 1
    ? list.filter((item) => item.id !== excludeId)
    : list
  return candidates[Math.floor(Math.random() * candidates.length)]
}

export function parseTag(raw: string): string {
  return raw.trim().replace(/,+$/, '').trim()
}
