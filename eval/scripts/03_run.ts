// 버전별 실행 → runs/<version>.jsonl (한 줄 = 호출 1회)
// 사용:
//   node scripts/03_run.ts --dry-run                       API 호출 없이 프롬프트만 확인
//   node scripts/03_run.ts --limit 10 --runs 1             시범 실행
//   node scripts/03_run.ts                                 전체 실행 (모든 버전 × RUNS 회)
//   node scripts/03_run.ts --versions v0,v3 --concurrency 3
//
// 캐시: (version, bookmark_id, run) 이 이미 jsonl 에 있으면 다시 호출하지 않는다.
// 시범 실행 결과도 같은 키로 저장되므로 전체 실행 때 재사용된다.
import fs from 'node:fs'
import path from 'node:path'
import {
  ANTHROPIC_VERSION, CONCURRENCY, DATA_DIR, MAX_RETRIES, MODEL, PRICE_PER_MTOK, RUNS, RUNS_DIR, SAMPLING, VERSION_ORDER,
} from '../config.ts'
import { loadLabels, loadRaw, loadSnapshot, priorBookmarks, shuffled, type Label, type Snapshot } from '../lib/data.ts'
import { env, requireEnv } from '../lib/env.ts'
import { VERSIONS, type BuiltRequest } from '../versions/index.ts'
import { parseFinal } from '../versions/parsers.ts'

// ── 인자 ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const flag = (name: string) => args.includes(`--${name}`)
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const dryRun = flag('dry-run')
const versionNames = (opt('versions')?.split(',') ?? [...VERSION_ORDER]).map((v) => v.trim())
const runs = Number(opt('runs') ?? RUNS)
const concurrency = Number(opt('concurrency') ?? CONCURRENCY)
const limit = opt('limit') ? Number(opt('limit')) : Infinity

for (const v of versionNames) {
  if (!VERSIONS[v]) {
    console.error(`알 수 없는 버전: ${v} (가능: ${Object.keys(VERSIONS).join(', ')})`)
    process.exit(1)
  }
}

// ── 데이터 ──────────────────────────────────────────────────────────────
const raw = loadRaw()
const catNames = new Set(raw.categories.map((c) => c.name))
const dbById = new Map(raw.bookmarks.map((b) => [b.id, b]))
const allLabels = loadLabels().filter((l) => !l.exclude)
const evalIds = new Set(allLabels.map((l) => l.bookmark_id))

type Item = { label: Label; snap: Snapshot }
const items: Item[] = []
let noSnapshot = 0
for (const label of allLabels) {
  const snap = loadSnapshot(label.bookmark_id)
  if (!snap) { noSnapshot++; continue }
  items.push({ label, snap })
}
if (noSnapshot) console.warn(`[run] 스냅샷이 없는 ${noSnapshot}개는 건너뜁니다 (02_snapshot.ts 실행 필요).`)

// --limit 은 시드 고정 셔플 후 앞에서 자른다 (매번 같은 부분집합)
const selected = Number.isFinite(limit) ? shuffled(items, SAMPLING.seed).slice(0, limit) : items

// Phase 7: v3d 는 카테고리 설명을 수정안으로 바꿔서 실행한다
let proposedCategories = raw.categories
if (versionNames.includes('v3d')) {
  const p = path.join(DATA_DIR, 'descriptions_proposed.json')
  if (!fs.existsSync(p)) {
    console.error('[run] v3d 를 실행하려면 먼저 scripts/04_propose.ts 로 수정안을 만들어야 합니다.')
    process.exit(1)
  }
  const proposed: Record<string, string> = JSON.parse(fs.readFileSync(p, 'utf8')).proposed
  proposedCategories = raw.categories.map((c) => ({ ...c, description: proposed[c.name] ?? c.description }))
}

function buildFor(version: string, item: Item): BuiltRequest {
  const db = dbById.get(item.label.bookmark_id)
  const prior = priorBookmarks(raw, item.label.bookmark_id, db?.date_saved ?? null)
  const categories = version === 'v3d' ? proposedCategories : raw.categories
  return VERSIONS[version].build({ snap: item.snap, categories, prior })
}

// ── dry-run ─────────────────────────────────────────────────────────────
if (dryRun) {
  const sample = selected[0]
  if (!sample) { console.log('[dry-run] 실행할 항목이 없습니다.'); process.exit(0) }
  for (const v of versionNames) {
    const req = buildFor(v, sample)
    console.log(`\n━━━ ${v}  (max_tokens ${req.max_tokens}, temperature ${req.temperature ?? '기본값'}, few-shot ${req.fewshot_ids.length}개) ━━━`)
    if (req.system) console.log(`[system]\n${req.system}\n`)
    for (const m of req.messages) console.log(`[${m.role}]\n${m.content}\n`)
  }
  console.log(`[dry-run] 대상 ${selected.length}개 × 버전 ${versionNames.length}개 × ${runs}회 = ${selected.length * versionNames.length * runs}회 호출 예정`)
  process.exit(0)
}

// ── API 호출 ────────────────────────────────────────────────────────────
const apiKey = requireEnv('anthropicKey', 'eval/.env 의 ANTHROPIC_API_KEY 또는 apps/extension/.env 의 VITE_CLAUDE_API_KEY 가 필요합니다.')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type ApiResult = { text: string; input_tokens: number; output_tokens: number; stop_reason: string; latency_ms: number; attempts: number }

async function callClaude(req: BuiltRequest): Promise<ApiResult> {
  const body: Record<string, unknown> = { model: MODEL, max_tokens: req.max_tokens, messages: req.messages }
  if (req.system !== undefined) body.system = req.system
  if (req.temperature !== undefined) body.temperature = req.temperature

  let lastErr = ''
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const t0 = performance.now()
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      })
      if (res.ok) {
        const data: any = await res.json()
        return {
          text: (data.content?.[0]?.text ?? '').trim(),
          input_tokens: data.usage?.input_tokens ?? 0,
          output_tokens: data.usage?.output_tokens ?? 0,
          stop_reason: data.stop_reason ?? '',
          latency_ms: Math.round(performance.now() - t0), // 성공한 시도 1회의 시간만 잰다
          attempts: attempt,
        }
      }
      lastErr = `HTTP ${res.status} ${(await res.text()).slice(0, 200)}`
      // 400/401/403/404 는 재시도해도 소용없다
      if (res.status < 500 && res.status !== 429 && res.status !== 408) throw new Error(`fatal: ${lastErr}`)
      const retryAfter = Number(res.headers.get('retry-after'))
      await sleep(retryAfter > 0 ? retryAfter * 1000 : Math.min(60000, 1000 * 2 ** (attempt - 1)) + Math.random() * 500)
    } catch (e: any) {
      if (String(e?.message).startsWith('fatal:')) throw e
      lastErr = String(e?.message ?? e)
      await sleep(Math.min(60000, 1000 * 2 ** (attempt - 1)) + Math.random() * 500)
    }
  }
  throw new Error(`재시도 ${MAX_RETRIES}회 실패: ${lastErr}`)
}

// ── 캐시 로드 ───────────────────────────────────────────────────────────
fs.mkdirSync(RUNS_DIR, { recursive: true })
const fileOf = (v: string) => path.join(RUNS_DIR, `${v}.jsonl`)
const doneKeys = new Set<string>()
for (const v of versionNames) {
  if (!fs.existsSync(fileOf(v))) continue
  for (const line of fs.readFileSync(fileOf(v), 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      const r = JSON.parse(line)
      doneKeys.add(`${r.version}|${r.bookmark_id}|${r.run}`)
    } catch { /* 깨진 줄은 무시 */ }
  }
}

type Job = { version: string; item: Item; run: number }
const jobs: Job[] = []
for (const v of versionNames) {
  for (const item of selected) {
    for (let run = 1; run <= runs; run++) {
      if (!doneKeys.has(`${v}|${item.label.bookmark_id}|${run}`)) jobs.push({ version: v, item, run })
    }
  }
}
const totalPlanned = versionNames.length * selected.length * runs
console.log(`[run] 모델 ${MODEL} / 대상 ${selected.length}개 × 버전 ${versionNames.length}개 × ${runs}회 = ${totalPlanned}회, 캐시 ${totalPlanned - jobs.length}회, 새로 호출 ${jobs.length}회`)

// ── 실행 ────────────────────────────────────────────────────────────────
const stats = new Map<string, { n: number; inTok: number; outTok: number }>()
let finished = 0
let failed = 0
let fatal: Error | null = null

async function runJob(job: Job) {
  const { version, item, run } = job
  const req = buildFor(version, item)
  const res = await callClaude(req)

  const final = parseFinal(res.text)
  const original = VERSIONS[version].parseOriginal(res.text)
  // 앱은 목록에 없는 카테고리 이름이 오면 아무것도 선택하지 않는다 → 미선택(null)으로 취급
  const valid = final.category != null && catNames.has(final.category)

  const record = {
    version,
    bookmark_id: item.label.bookmark_id,
    run,
    pred_category: valid ? final.category : null,
    raw_category: final.category,
    pred_tags: final.tags,
    is_null: final.ok && !valid,
    invalid_category: final.ok && final.category != null && !valid,
    parse_ok: final.ok,
    parse_ok_original: original.ok,
    input_tokens: res.input_tokens,
    output_tokens: res.output_tokens,
    latency_ms: res.latency_ms,
    attempts: res.attempts,
    stop_reason: res.stop_reason,
    fewshot_ids: req.fewshot_ids,
    fewshot_in_evalset: req.fewshot_ids.filter((id) => evalIds.has(id)),
    raw_response: res.text,
    ts: new Date().toISOString(),
  }
  fs.appendFileSync(fileOf(version), JSON.stringify(record) + '\n', 'utf8')

  const s = stats.get(version) ?? { n: 0, inTok: 0, outTok: 0 }
  s.n++; s.inTok += res.input_tokens; s.outTok += res.output_tokens
  stats.set(version, s)
}

let cursor = 0
async function worker() {
  while (cursor < jobs.length && !fatal) {
    const job = jobs[cursor++]
    try {
      await runJob(job)
    } catch (e: any) {
      if (String(e?.message).startsWith('fatal:')) { fatal = e; return }
      failed++
      console.warn(`[run] 실패 (${job.version} ${job.item.label.bookmark_id} #${job.run}): ${e?.message}`)
    }
    finished++
    if (finished % 25 === 0) console.log(`[run] ${finished}/${jobs.length}`)
  }
}
await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker))

if (fatal) {
  console.error(`[run] 중단: ${(fatal as Error).message}`)
  process.exit(1)
}

// ── 비용 요약 ───────────────────────────────────────────────────────────
const cost = (i: number, o: number) => (i * PRICE_PER_MTOK.input + o * PRICE_PER_MTOK.output) / 1e6
let sum = 0
let perItemAllVersions = 0
console.log('\n버전     호출   평균 입력   평균 출력   건당 비용($)   이번 실행 합계($)')
for (const v of versionNames) {
  const s = stats.get(v)
  if (!s) continue
  const c = cost(s.inTok, s.outTok)
  sum += c
  perItemAllVersions += c / s.n
  console.log(
    `${v.padEnd(7)} ${String(s.n).padStart(5)} ${(s.inTok / s.n).toFixed(0).padStart(10)} ${(s.outTok / s.n).toFixed(0).padStart(10)} ${(c / s.n).toFixed(5).padStart(13)} ${c.toFixed(4).padStart(15)}`,
  )
}
console.log(`\n[run] 이번 실행 비용 약 $${sum.toFixed(4)} (실패 ${failed}회 — 다시 실행하면 실패분만 재시도)`)
if (stats.size === versionNames.length && items.length) {
  const full = perItemAllVersions * items.length * RUNS
  console.log(`[run] 전체 실행 추정: ${items.length}개 × ${versionNames.length}버전 × ${RUNS}회 ≈ $${full.toFixed(2)}`)
}
