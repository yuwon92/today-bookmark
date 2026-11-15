import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { LABELS_PATH, LABELS_PENDING_PATH, RAW_PATH, SNAPSHOT_DIR } from '../config.ts'
import { readCsv } from './csv.ts'

export type Category = { id: string; name: string; description: string }

export type RawBookmark = {
  id: string
  url: string
  title: string
  description: string
  category_id: string | null
  tags: string[]
  date_saved: string
}

export type Raw = {
  exported_at: string
  excluded_categories: string[]
  excluded_bookmark_count: number
  categories: Category[]
  /** 제외 카테고리를 뺀 전체 북마크 (미분류 포함), date_saved 내림차순 */
  bookmarks: RawBookmark[]
}

export const LABEL_COLUMNS = [
  'bookmark_id', 'url', 'title', 'gold_category', 'gold_tags',
  'ambiguous', 'alt_category', 'label_source', 'exclude', 'note',
] as const

export type Label = {
  bookmark_id: string
  url: string
  title: string
  gold_category: string // 카테고리 이름 또는 'NONE'
  gold_tags: string[]
  ambiguous: boolean
  alt_category: string
  label_source: string // user_final | relabeled | added
  exclude: boolean
  note: string
}

export type Snapshot = {
  bookmark_id: string
  url: string
  is_x: boolean
  title: string
  description: string
  siteName: string
  keywords: string[]
  bodyExcerpt: string
  /** ok | body_empty | http_<code> | timeout | error */
  fetch_status: string
  /** 각 필드의 출처: db(저장 당시 확장앱이 추출) / server(서버 HTML 파싱) / jina */
  sources: { title: string; description: string; body: string }
  fetched_at: string
}

export function loadRaw(): Raw {
  if (!fs.existsSync(RAW_PATH)) {
    console.error(`[data] ${RAW_PATH} 가 없습니다. 먼저 01_export.ts 를 실행하세요.`)
    process.exit(1)
  }
  return JSON.parse(fs.readFileSync(RAW_PATH, 'utf8'))
}

export function splitTags(s: string): string[] {
  return s.split(/[,;|]/).map((t) => t.trim()).filter(Boolean)
}

export function loadLabels(): Label[] {
  if (!fs.existsSync(LABELS_PATH)) {
    console.error(`[data] ${LABELS_PATH} 가 없습니다. 먼저 01b_sample.ts 를 실행하세요.`)
    process.exit(1)
  }
  const main = readCsv(LABELS_PATH)
  const have = new Set(main.map((r) => r.bookmark_id))
  const pending = fs.existsSync(LABELS_PENDING_PATH)
    ? readCsv(LABELS_PENDING_PATH).filter((r) => !have.has(r.bookmark_id))
    : []
  return [...main, ...pending].map((r) => ({
    bookmark_id: r.bookmark_id,
    url: r.url,
    title: r.title ?? '',
    gold_category: r.gold_category,
    gold_tags: splitTags(r.gold_tags ?? ''),
    ambiguous: r.ambiguous === '1',
    alt_category: r.alt_category ?? '',
    label_source: r.label_source ?? '',
    exclude: r.exclude === '1',
    note: r.note ?? '',
  }))
}

export function snapshotPath(id: string): string {
  return path.join(SNAPSHOT_DIR, `${id}.json`)
}

export function loadSnapshot(id: string): Snapshot | null {
  const p = snapshotPath(id)
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null
}

export function extraId(url: string): string {
  return 'extra-' + crypto.createHash('sha1').update(url).digest('hex').slice(0, 12)
}

const X_HOSTS = ['x.com', 'twitter.com', 'mobile.twitter.com']
// apps/extension/src/lib/jinaReader.ts 의 isXUrl 과 동일
export function isXUrl(url: string): boolean {
  try {
    return X_HOSTS.includes(new URL(url).hostname.replace(/^www\./, ''))
  } catch {
    return false
  }
}

/**
 * 대상 북마크를 저장하던 시점에 앱이 볼 수 있었던 북마크 목록 (date_saved 내림차순).
 * - 대상 자신과 그 이후에 저장된 북마크는 제외한다 (few-shot/태그 풀 누수 방지).
 * - dateSaved 가 null 이면(사용자가 따로 준 링크) "지금 저장한다"고 보고 전체를 반환한다.
 */
export function priorBookmarks(raw: Raw, targetId: string, dateSaved: string | null): RawBookmark[] {
  const cutoff = dateSaved == null ? Infinity : Date.parse(dateSaved)
  return raw.bookmarks.filter((b) => b.id !== targetId && Date.parse(b.date_saved) < cutoff)
}

// 시드 고정 난수 (mulberry32)
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffled<T>(arr: T[], seed: number): T[] {
  const r = rng(seed)
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
