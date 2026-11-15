// 평가셋 샘플링 + 라벨 초안 → data/labels.csv
// 사용: node scripts/01b_sample.ts [--force]
//
// - 기존 북마크: 카테고리별 층화 추출 (작은 카테고리는 전부 포함).
// - data/extra_links.csv (url,gold_category,note) 가 있으면 사용자가 따로 준 링크로 추가한다.
//   gold_category 는 카테고리 이름 또는 NONE.
// - labels.csv 가 이미 있으면 기존 행(사용자가 검토한 라벨)은 그대로 두고, 카테고리별 목표 개수에
//   모자란 만큼만 새로 뽑아 뒤에 붙인다. 처음부터 다시 만들려면 --force.
// - labels.csv 가 엑셀에 열려 있어 쓸 수 없으면 새 행을 labels_pending.csv 에 둔다.
//   (실행/분석 스크립트는 두 파일을 함께 읽는다. 엑셀을 닫고 다시 실행하면 합쳐진다.)
import fs from 'node:fs'
import { DATA_DIR, EXTRA_LINKS_PATH, LABELS_PATH, LABELS_PENDING_PATH, SAMPLING } from '../config.ts'
import { readCsv, writeCsv } from '../lib/csv.ts'
import { LABEL_COLUMNS, extraId, isXUrl, loadRaw, shuffled, type RawBookmark } from '../lib/data.ts'

const force = process.argv.includes('--force')
const raw = loadRaw()
const nameById = new Map(raw.categories.map((c) => [c.id, c.name]))
const catNames = new Set(raw.categories.map((c) => c.name))

// ── 0. 이미 있는 라벨 ───────────────────────────────────────────────────
const readIf = (p: string) => (fs.existsSync(p) && !force ? readCsv(p) : [])
const existingMain = readIf(LABELS_PATH)
const mainIds = new Set(existingMain.map((r) => r.bookmark_id))
const existingPending = readIf(LABELS_PENDING_PATH).filter((r) => !mainIds.has(r.bookmark_id))
const existing = [...existingMain, ...existingPending]
const existingIds = new Set(existing.map((r) => r.bookmark_id))

// ── 1. 기존 북마크 층화 추출 ────────────────────────────────────────────
const groups = new Map<string, RawBookmark[]>()
for (const b of raw.bookmarks) {
  const name = b.category_id ? nameById.get(b.category_id) : undefined
  if (!name) continue // 미분류는 정답이 없으므로 평가 대상에서 제외 (few-shot 문맥으로만 쓰임)
  if (!groups.has(name)) groups.set(name, [])
  groups.get(name)!.push(b)
}

const total = [...groups.values()].reduce((s, g) => s + g.length, 0)
const alloc = new Map<string, number>()
if (total <= SAMPLING.targetFromDb) {
  for (const [k, g] of groups) alloc.set(k, g.length)
} else {
  let used = 0
  for (const [k, g] of groups) {
    const base = Math.min(g.length, SAMPLING.minPerCategory)
    alloc.set(k, base)
    used += base
  }
  // 남은 예산을 (남은 개수) 비례로 배분 — 최대 잉여법
  const budget = Math.max(0, SAMPLING.targetFromDb - used)
  const rest = [...groups].map(([k, g]) => ({ k, left: g.length - alloc.get(k)! }))
  const restTotal = rest.reduce((s, r) => s + r.left, 0)
  if (budget > 0 && restTotal > 0) {
    const shares = rest.map((r) => ({ ...r, exact: (budget * r.left) / restTotal }))
    let given = 0
    for (const s of shares) {
      const add = Math.min(s.left, Math.floor(s.exact))
      alloc.set(s.k, alloc.get(s.k)! + add)
      given += add
    }
    const byRemainder = shares.slice().sort((a, b) => (b.exact % 1) - (a.exact % 1))
    for (const s of byRemainder) {
      if (given >= budget) break
      if (alloc.get(s.k)! < groups.get(s.k)!.length) {
        alloc.set(s.k, alloc.get(s.k)! + 1)
        given++
      }
    }
  }
}

// 이미 라벨에 있는 북마크는 유지하고, 목표에 모자란 만큼만 새로 뽑는다
const sampled: RawBookmark[] = []
const kept = new Map<string, number>()
let i = 0
for (const [k, g] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
  const already = g.filter((b) => existingIds.has(b.id)).length
  kept.set(k, already)
  const need = Math.max(0, alloc.get(k)! - already)
  const pool = shuffled(g.filter((b) => !existingIds.has(b.id)), SAMPLING.seed + i++)
  sampled.push(...pool.slice(0, need))
}
sampled.sort((a, b) => Date.parse(a.date_saved) - Date.parse(b.date_saved))

const added: Record<string, unknown>[] = sampled.map((b) => ({
  bookmark_id: b.id,
  url: b.url,
  title: b.title,
  gold_category: nameById.get(b.category_id!)!,
  gold_tags: b.tags.join(', '),
  ambiguous: '',
  alt_category: '',
  label_source: 'user_final',
  exclude: '',
  note: '',
}))

// ── 2. 사용자가 따로 준 링크 ────────────────────────────────────────────
fs.mkdirSync(DATA_DIR, { recursive: true })
if (!fs.existsSync(EXTRA_LINKS_PATH)) {
  writeCsv(EXTRA_LINKS_PATH, [], ['url', 'gold_category', 'note'])
  console.log(`[sample] 빈 템플릿 생성: ${EXTRA_LINKS_PATH}`)
}
const dbUrls = new Set(raw.bookmarks.map((b) => b.url))
let extraCount = 0
for (const r of readCsv(EXTRA_LINKS_PATH)) {
  if (!r.url) continue
  const gold = r.gold_category || ''
  if (gold && gold !== 'NONE' && !catNames.has(gold)) {
    console.warn(`[sample] 경고: 알 수 없는 카테고리 "${gold}" — ${r.url} (카테고리 이름 또는 NONE 이어야 함)`)
  }
  if (dbUrls.has(r.url)) {
    console.warn(`[sample] 건너뜀: 이미 저장된 북마크와 같은 URL — ${r.url}`)
    continue
  }
  extraCount++
  if (existingIds.has(extraId(r.url))) continue
  added.push({
    bookmark_id: extraId(r.url),
    url: r.url,
    title: '',
    gold_category: gold,
    gold_tags: '',
    ambiguous: '',
    alt_category: '',
    label_source: 'added',
    exclude: '',
    note: r.note ?? '',
  })
}

// ── 3. 저장 ─────────────────────────────────────────────────────────────
const finalRows = [...existing, ...added]
try {
  writeCsv(LABELS_PATH, finalRows, [...LABEL_COLUMNS])
  if (fs.existsSync(LABELS_PENDING_PATH)) fs.rmSync(LABELS_PENDING_PATH)
  console.log(`[sample] 저장: ${LABELS_PATH} (${finalRows.length}행, 기존 ${existing.length} + 새로 ${added.length})`)
} catch (e: any) {
  if (e?.code !== 'EBUSY' && e?.code !== 'EPERM') throw e
  writeCsv(LABELS_PENDING_PATH, [...existingPending, ...added], [...LABEL_COLUMNS])
  console.warn(`[sample] labels.csv 가 다른 프로그램(엑셀)에 열려 있어 쓸 수 없습니다.`)
  console.warn(`         새 행 ${existingPending.length + added.length}개를 ${LABELS_PENDING_PATH} 에 두었습니다.`)
  console.warn(`         엑셀에서 저장하고 닫은 뒤 이 스크립트를 다시 실행하면 labels.csv 로 합쳐집니다.`)
}

// ── 요약 ────────────────────────────────────────────────────────────────
console.log(`  분류된 기존 북마크 ${total}개, 따로 준 링크 ${extraCount}개`)
console.log(`  카테고리 수 ${groups.size}개. 카테고리별 (기존 유지 + 새로 추출 / 전체) — 이름은 data/ 안에서만 확인`)
let idx = 0
for (const [k, g] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
  const newly = sampled.filter((b) => nameById.get(b.category_id!) === k).length
  console.log(`    #${++idx}  ${String(kept.get(k)).padStart(3)} + ${String(newly).padStart(3)} / ${String(g.length).padStart(3)}`)
}
const xCount = finalRows.filter((r) => isXUrl(String(r.url))).length
const noneCount = finalRows.filter((r) => r.gold_category === 'NONE').length
console.log(`  합계 ${finalRows.length}행: X 링크 ${xCount}개 / 일반 ${finalRows.length - xCount}개 / NONE ${noneCount}개`)
