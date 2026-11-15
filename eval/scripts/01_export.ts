// Supabase 에서 카테고리와 북마크를 내보낸다 → data/bookmarks_raw.json
// 사용: node scripts/01_export.ts
//
// - service_role 키는 RLS 를 우회하므로, 프로젝트에 사용자가 여러 명이면 EVAL_USER_ID 로 본인을 지정해야 한다.
// - config.ts 의 EXCLUDED_CATEGORIES 에 속한 카테고리와 그 북마크는 파일에 쓰지 않는다.
import fs from 'node:fs'
import { DATA_DIR, EXCLUDED_CATEGORIES, RAW_PATH } from '../config.ts'
import { env, requireEnv } from '../lib/env.ts'
import type { Raw } from '../lib/data.ts'

const url = requireEnv('supabaseUrl', 'apps/extension/.env 의 VITE_SUPABASE_URL 을 확인하세요.')
const key = requireEnv('supabaseServiceKey', 'eval/.env 에 SUPABASE_SERVICE_ROLE_KEY 를 넣어주세요.')

async function fetchAll(table: string, select: string, order: string): Promise<any[]> {
  const rows: any[] = []
  const page = 1000
  for (let offset = 0; ; offset += page) {
    const q = new URLSearchParams({ select, order, limit: String(page), offset: String(offset) })
    if (env.userId) q.set('user_id', `eq.${env.userId}`)
    const res = await fetch(`${url}/rest/v1/${table}?${q}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    })
    if (!res.ok) {
      console.error(`[export] ${table} 조회 실패: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`)
      process.exit(1)
    }
    const batch = await res.json()
    rows.push(...batch)
    if (batch.length < page) break
  }
  return rows
}

const categoriesAll = await fetchAll('categories', 'id,user_id,name,description', 'name.asc')
const bookmarksAll = await fetchAll(
  'bookmarks',
  'id,user_id,url,title,description,category_id,tags,date_saved',
  'date_saved.desc',
)

const userIds = new Set([...categoriesAll, ...bookmarksAll].map((r) => r.user_id))
if (userIds.size > 1) {
  console.error(`[export] 이 Supabase 프로젝트에 사용자가 ${userIds.size}명 있습니다. 본인 데이터만 써야 하므로`)
  console.error('         eval/.env 에 EVAL_USER_ID=<본인 user_id> 를 추가한 뒤 다시 실행하세요.')
  console.error('         user_id별 북마크 수:')
  const counts = new Map<string, number>()
  for (const b of bookmarksAll) counts.set(b.user_id, (counts.get(b.user_id) ?? 0) + 1)
  for (const [id, n] of counts) console.error(`           ${id}  ${n}개`)
  process.exit(1)
}

const excludedIds = new Set(
  categoriesAll.filter((c) => EXCLUDED_CATEGORIES.includes(c.name)).map((c) => c.id),
)
const missing = EXCLUDED_CATEGORIES.filter((n) => !categoriesAll.some((c) => c.name === n))
if (missing.length) {
  console.warn(`[export] 경고: 제외 대상 카테고리를 찾지 못했습니다: ${missing.join(', ')}`)
  console.warn(`         현재 카테고리: ${categoriesAll.map((c) => c.name).join(', ')}`)
}

const categories = categoriesAll
  .filter((c) => !excludedIds.has(c.id))
  .map((c) => ({ id: c.id, name: c.name, description: c.description ?? '' }))

const bookmarks = bookmarksAll
  .filter((b) => !(b.category_id && excludedIds.has(b.category_id)))
  .map((b) => ({
    id: b.id,
    url: b.url,
    title: b.title ?? '',
    description: b.description ?? '',
    category_id: b.category_id ?? null,
    tags: Array.isArray(b.tags) ? b.tags : [],
    date_saved: b.date_saved,
  }))

const raw: Raw = {
  exported_at: new Date().toISOString(),
  excluded_categories: EXCLUDED_CATEGORIES,
  excluded_bookmark_count: bookmarksAll.length - bookmarks.length,
  categories,
  bookmarks,
}

fs.mkdirSync(DATA_DIR, { recursive: true })
fs.writeFileSync(RAW_PATH, JSON.stringify(raw, null, 2), 'utf8')

// ── 요약 ────────────────────────────────────────────────────────────────
const isX = (u: string) => /^https?:\/\/(www\.|mobile\.)?(x|twitter)\.com\//i.test(u)
const nameById = new Map(categories.map((c) => [c.id, c.name]))
const perCat = new Map<string, number>()
for (const b of bookmarks) {
  const k = b.category_id ? nameById.get(b.category_id) ?? '(삭제된 카테고리)' : '(미분류)'
  perCat.set(k, (perCat.get(k) ?? 0) + 1)
}
console.log(`[export] 저장: ${RAW_PATH}`)
console.log(`  북마크 ${bookmarks.length}개 (제외된 카테고리 소속 ${raw.excluded_bookmark_count}개는 뺌)`)
console.log(`  X 링크 ${bookmarks.filter((b) => isX(b.url)).length}개 / 그 외 ${bookmarks.filter((b) => !isX(b.url)).length}개`)
console.log(`  카테고리 ${categories.length}개 (description 있는 것 ${categories.filter((c) => c.description).length}개)`)
for (const [k, n] of [...perCat].sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(4)}  ${k}`)
if (bookmarks.length) {
  console.log(`  기간: ${bookmarks[bookmarks.length - 1].date_saved.slice(0, 10)} ~ ${bookmarks[0].date_saved.slice(0, 10)}`)
}
