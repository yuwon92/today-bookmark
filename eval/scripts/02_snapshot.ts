// 평가셋 각 북마크의 입력 정보를 한 번만 수집해서 저장 → data/snapshots/<id>.json
// 사용: node scripts/02_snapshot.ts [--force] [--retry-failed] [--limit N]
//
// 모든 버전이 같은 스냅샷을 쓴다. 최종 버전이 쓰는 필드를 전부 모으고, 하위 버전은 일부만 사용한다.
//
// 필드 출처
// - X 링크: title/description 은 DB 값(저장 당시 확장앱이 브라우저에서 추출한 값),
//   본문은 Jina Reader (앱의 fetchJinaContent 와 같은 요청). siteName/keywords 는 비움.
// - 일반 페이지: 서버에서 HTML 을 받아 extractPageMeta 와 같은 규칙으로 파싱.
//   DB 에 title/description 이 있으면 그 값을 우선한다.
//
// 한계: 앱은 렌더링된 DOM 의 innerText 를 읽지만 여기서는 서버 HTML 의 textContent 를 쓴다.
// JS 로 그려지는 페이지나 숨겨진 요소가 많은 페이지는 본문이 다를 수 있다.
// 또 앱은 Jina 를 2.5초에서 끊지만 여기서는 길게 기다린다.
import fs from 'node:fs'
import { parseHTML } from 'linkedom'
import { DATA_DIR, SNAPSHOT, SNAPSHOT_DIR } from '../config.ts'
import { writeCsv } from '../lib/csv.ts'
import { isXUrl, loadLabels, loadRaw, loadSnapshot, snapshotPath, type Snapshot } from '../lib/data.ts'
import { env } from '../lib/env.ts'

const args = process.argv.slice(2)
const force = args.includes('--force')
const retryFailed = args.includes('--retry-failed')
const limitIdx = args.indexOf('--limit')
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const normalize = (s: string) => s.replace(/\s+/g, ' ').trim()

// ── Jina Reader (apps/extension/src/lib/jinaReader.ts 와 같은 요청) ──────
async function fetchJina(url: string): Promise<{ text: string; status: string }> {
  const headers: Record<string, string> = { Accept: 'text/plain', 'X-Return-Format': 'text' }
  if (env.jinaKey) headers.Authorization = `Bearer ${env.jinaKey}`
  let status = 'error'
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`https://r.jina.ai/${url}`, {
        headers,
        signal: AbortSignal.timeout(SNAPSHOT.jinaTimeoutMs),
      })
      if (res.ok) {
        const text = normalize(await res.text()).slice(0, SNAPSHOT.jinaChars)
        return { text, status: text ? 'ok' : 'body_empty' }
      }
      status = `http_${res.status}`
      if (res.status !== 429 && res.status < 500) break
    } catch (e: any) {
      status = e?.name === 'TimeoutError' ? 'timeout' : 'error'
    }
    await sleep(5000 * (attempt + 1))
  }
  return { text: '', status }
}

// ── 일반 페이지 대체 경로: 서버 HTML 을 못 받았거나 본문이 비었을 때 Jina Reader(JSON) 로 받는다 ──
// 앱에는 없는 경로다. 앱은 브라우저가 렌더링한 DOM 을 읽으므로 차단/JS 렌더링 문제가 없지만,
// 평가에서는 서버 요청이 막히는 사이트가 있어서 그 차이를 메우기 위해 쓴다 (한계로 기록).
async function fetchJinaJson(url: string): Promise<{ title: string; description: string; body: string } | null> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (env.jinaKey) headers.Authorization = `Bearer ${env.jinaKey}`
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`https://r.jina.ai/${url}`, { headers, signal: AbortSignal.timeout(SNAPSHOT.jinaTimeoutMs) })
      if (res.ok) {
        const d: any = (await res.json())?.data ?? {}
        return {
          title: normalize(String(d.title ?? '')),
          description: normalize(String(d.description ?? '')),
          body: normalize(String(d.content ?? d.text ?? '')).slice(0, SNAPSHOT.bodyChars),
        }
      }
      if (res.status !== 429 && res.status < 500) return null
    } catch { /* 재시도 */ }
    await sleep(5000 * (attempt + 1))
  }
  return null
}

// ── 일반 페이지: extractPageMeta 를 서버 HTML 에 대해 재현 ───────────────
async function fetchHtml(url: string): Promise<{ html: string; status: string }> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(SNAPSHOT.htmlTimeoutMs),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      },
    })
    if (!res.ok) return { html: '', status: `http_${res.status}` }
    const buf = Buffer.from(await res.arrayBuffer())
    // 문자셋: Content-Type 헤더 → <meta charset> 순으로 확인 (EUC-KR 페이지 대응)
    const head = buf.subarray(0, 4096).toString('latin1')
    const charset =
      res.headers.get('content-type')?.match(/charset=([\w-]+)/i)?.[1] ||
      head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ||
      'utf-8'
    let html: string
    try { html = new TextDecoder(charset).decode(buf) } catch { html = buf.toString('utf8') }
    return { html, status: 'ok' }
  } catch (e: any) {
    return { html: '', status: e?.name === 'TimeoutError' ? 'timeout' : 'error' }
  }
}

function extractFromHtml(html: string) {
  const { document } = parseHTML(html)
  const getMeta = (selector: string) => document.querySelector(selector)?.getAttribute('content') ?? ''

  const keywordSet = new Set<string>()
  for (const sel of ['meta[name="keywords"]', 'meta[name="news_keywords"]']) {
    const kw = getMeta(sel)
    if (kw) kw.split(',').forEach((k: string) => { const t = k.trim(); if (t) keywordSet.add(t) })
  }
  document.querySelectorAll('meta[property="article:tag"]').forEach((el: any) => {
    const v = el.getAttribute('content')?.trim()
    if (v) keywordSet.add(v)
  })

  const title =
    getMeta('meta[property="og:title"]') ||
    getMeta('meta[name="twitter:title"]') ||
    document.querySelector('title')?.textContent?.trim() ||
    ''
  const description = getMeta('meta[property="og:description"]') || getMeta('meta[name="description"]') || ''
  const siteName = getMeta('meta[property="og:site_name"]') || ''

  // innerText 는 script/style 을 포함하지 않으므로 textContent 를 쓰기 전에 제거한다
  document.querySelectorAll('script, style, noscript, template, svg').forEach((el: any) => el.remove())
  const bodyEl = document.querySelector('main') || document.querySelector('article') || document.body
  const bodyExcerpt = normalize(bodyEl?.textContent ?? '').slice(0, SNAPSHOT.bodyChars)

  return { title, description, siteName, keywords: Array.from(keywordSet).slice(0, 20), bodyExcerpt }
}

// ── 메인 ────────────────────────────────────────────────────────────────
const raw = loadRaw()
const dbById = new Map(raw.bookmarks.map((b) => [b.id, b]))
const labels = loadLabels()
fs.mkdirSync(SNAPSHOT_DIR, { recursive: true })

const jinaInterval = env.jinaKey ? SNAPSHOT.jinaIntervalWithKeyMs : SNAPSHOT.jinaIntervalMs
let done = 0
let fetched = 0

for (const label of labels) {
  if (fetched >= limit) break
  const prev = loadSnapshot(label.bookmark_id)
  if (prev && !force && !(retryFailed && !prev.fetch_status.startsWith('ok'))) continue

  const db = dbById.get(label.bookmark_id)
  const isX = isXUrl(label.url)
  let snap: Snapshot

  if (isX) {
    const { text, status } = await fetchJina(label.url)
    snap = {
      bookmark_id: label.bookmark_id,
      url: label.url,
      is_x: true,
      title: db?.title ?? '',
      description: db?.description ?? '',
      siteName: '',
      keywords: [],
      bodyExcerpt: text,
      fetch_status: status,
      sources: { title: 'db', description: 'db', body: 'jina' },
      fetched_at: new Date().toISOString(),
    }
    await sleep(jinaInterval)
  } else {
    const { html, status } = await fetchHtml(label.url)
    const ex = html
      ? extractFromHtml(html)
      : { title: '', description: '', siteName: '', keywords: [], bodyExcerpt: '' }
    const title = db?.title || ex.title
    const description = db?.description || ex.description
    snap = {
      bookmark_id: label.bookmark_id,
      url: label.url,
      is_x: false,
      title,
      description,
      siteName: ex.siteName,
      keywords: ex.keywords,
      bodyExcerpt: ex.bodyExcerpt,
      fetch_status: status === 'ok' && !ex.bodyExcerpt ? 'body_empty' : status,
      sources: {
        title: db?.title ? 'db' : 'server',
        description: db?.description ? 'db' : 'server',
        body: 'server',
      },
      fetched_at: new Date().toISOString(),
    }
  }

  if (!isX && snap.fetch_status !== 'ok') {
    const j = await fetchJinaJson(label.url)
    await sleep(jinaInterval)
    if (j && (j.body || j.title)) {
      const before = snap.fetch_status
      if (!snap.title && j.title) { snap.title = j.title; snap.sources.title = 'jina_fallback' }
      if (!snap.description && j.description) { snap.description = j.description; snap.sources.description = 'jina_fallback' }
      if (!snap.bodyExcerpt && j.body) { snap.bodyExcerpt = j.body; snap.sources.body = 'jina_fallback' }
      snap.fetch_status = snap.bodyExcerpt ? `ok_jina_fallback(${before})` : before
    }
  }
  fs.writeFileSync(snapshotPath(label.bookmark_id), JSON.stringify(snap, null, 2), 'utf8')
  fetched++
  done++
  if (done % 10 === 0) console.log(`[snapshot] ${done}개 수집…`)
}

// ── 요약 + 상태 표 ──────────────────────────────────────────────────────
const statusRows: Record<string, unknown>[] = []
const counts = new Map<string, number>()
let missing = 0
for (const label of labels) {
  const s = loadSnapshot(label.bookmark_id)
  if (!s) { missing++; continue }
  counts.set(s.fetch_status, (counts.get(s.fetch_status) ?? 0) + 1)
  statusRows.push({
    bookmark_id: s.bookmark_id,
    url: s.url,
    is_x: s.is_x ? 1 : 0,
    fetch_status: s.fetch_status,
    title_len: s.title.length,
    description_len: s.description.length,
    body_len: s.bodyExcerpt.length,
    keywords: s.keywords.length,
    body_head: s.bodyExcerpt.slice(0, 80),
  })
}
const statusPath = `${DATA_DIR}/snapshot_status.csv`
writeCsv(statusPath, statusRows, [
  'bookmark_id', 'url', 'is_x', 'fetch_status', 'title_len', 'description_len', 'body_len', 'keywords', 'body_head',
])
console.log(`[snapshot] 이번에 수집 ${fetched}개, 전체 ${statusRows.length}/${labels.length}개 (미수집 ${missing}개)`)
for (const [k, n] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(4)}  ${k}`)
console.log(`  상태 표: ${statusPath}`)
