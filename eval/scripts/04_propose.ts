// Phase 7: 카테고리 설명 자동 개선 실험 — 분할 + 수정안 생성
// 사용: node scripts/04_propose.ts [--force]
//
// 1. 평가셋을 dev / test 로 반씩 나눈다 (정답 카테고리별 층화, 시드 고정) → data/split.csv
// 2. dev 에서 현재 버전(v3)이 틀린 사례를 모은다 (3회 반복의 다수결 기준)
// 3. 현재 설명 + dev 실패 사례를 LLM 에 넘겨 설명 수정안을 받는다 → data/descriptions_proposed.json
//    test 셋의 북마크는 LLM 에 전혀 보여 주지 않는다.
// 4. 사람이 볼 diff 를 runs/analysis_private/phase7_proposal.md 에 쓴다 (비공개: 설명 문구와 사례 포함)
//
// 이후: node scripts/03_run.ts --versions v3d  →  python analysis/phase7.py
// 수정안은 앱이나 DB 에 적용하지 않는다. 평가 안에서만 쓴다.
import fs from 'node:fs'
import path from 'node:path'
import { ANTHROPIC_VERSION, DATA_DIR, PROPOSER_MODEL, RUNS_DIR, SAMPLING } from '../config.ts'
import { writeCsv } from '../lib/csv.ts'
import { loadLabels, loadRaw, loadSnapshot, shuffled, type Label } from '../lib/data.ts'
import { requireEnv } from '../lib/env.ts'
import { extractJsonObject } from '../versions/appCode.ts'

const force = process.argv.includes('--force')
const SPLIT_PATH = path.join(DATA_DIR, 'split.csv')
const PROPOSED_PATH = path.join(DATA_DIR, 'descriptions_proposed.json')
const PRIVATE_DIR = path.join(RUNS_DIR, 'analysis_private')

if (fs.existsSync(PROPOSED_PATH) && !force) {
  console.error(`[propose] ${PROPOSED_PATH} 가 이미 있습니다. 다시 만들면 v3d 캐시(runs/v3d.jsonl)도 지워야 합니다. 다시 만들려면 --force`)
  process.exit(1)
}

const raw = loadRaw()
const labels = loadLabels().filter((l) => !l.exclude)

// ── 1. 층화 분할 ────────────────────────────────────────────────────────
const byGold = new Map<string, Label[]>()
for (const l of labels) {
  if (!byGold.has(l.gold_category)) byGold.set(l.gold_category, [])
  byGold.get(l.gold_category)!.push(l)
}
const split = new Map<string, 'dev' | 'test'>()
let gi = 0
let carry = 0 // 홀수 개 그룹의 나머지를 dev/test 에 번갈아 준다
for (const [, group] of [...byGold].sort((a, b) => a[0].localeCompare(b[0]))) {
  const order = shuffled(group, SAMPLING.seed + 7000 + gi++)
  const nDev = Math.floor(order.length / 2) + (order.length % 2 ? carry++ % 2 : 0)
  order.forEach((l, i) => split.set(l.bookmark_id, i < nDev ? 'dev' : 'test'))
}
writeCsv(SPLIT_PATH, labels.map((l) => ({ bookmark_id: l.bookmark_id, split: split.get(l.bookmark_id) })), ['bookmark_id', 'split'])

// ── 2. dev 에서 v3 가 틀린 사례 ─────────────────────────────────────────
const v3Path = path.join(RUNS_DIR, 'v3.jsonl')
if (!fs.existsSync(v3Path)) {
  console.error('[propose] runs/v3.jsonl 이 없습니다. 먼저 전체 실행을 하세요.')
  process.exit(1)
}
const preds = new Map<string, Array<string | null>>()
for (const line of fs.readFileSync(v3Path, 'utf8').split('\n')) {
  if (!line.trim()) continue
  const r = JSON.parse(line)
  if (!preds.has(r.bookmark_id)) preds.set(r.bookmark_id, [])
  preds.get(r.bookmark_id)![r.run - 1] = r.parse_ok ? r.pred_category : null
}
function majority(xs: Array<string | null>): string | null {
  const counts = new Map<string | null, number>()
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1)
  const [top, n] = [...counts].sort((a, b) => b[1] - a[1])[0]
  return n > xs.length / 2 ? top : xs[0]
}

type Failure = { gold: string; pred: string | null; title: string; body: string }
const failures: Failure[] = []
const devLabels = labels.filter((l) => split.get(l.bookmark_id) === 'dev')
for (const l of devLabels) {
  const p = majority(preds.get(l.bookmark_id) ?? [null])
  const correct =
    l.gold_category === 'NONE' ? p == null : p === l.gold_category || (l.ambiguous && !!l.alt_category && p === l.alt_category)
  if (correct) continue
  const snap = loadSnapshot(l.bookmark_id)
  failures.push({
    gold: l.gold_category,
    pred: p,
    title: (snap?.title ?? '').slice(0, 120),
    body: (snap?.bodyExcerpt ?? '').slice(0, 300),
  })
}

// 카테고리별로 dev 에서 맞힌 예시 제목도 몇 개 준다 (범위를 잘못 좁히지 않도록)
const correctTitles = new Map<string, string[]>()
for (const l of devLabels) {
  if (l.gold_category === 'NONE') continue
  if (majority(preds.get(l.bookmark_id) ?? [null]) !== l.gold_category) continue
  const arr = correctTitles.get(l.gold_category) ?? []
  if (arr.length < 6) arr.push((loadSnapshot(l.bookmark_id)?.title ?? '').slice(0, 80))
  correctTitles.set(l.gold_category, arr)
}

console.log(`[propose] 분할: dev ${devLabels.length}개 / test ${labels.length - devLabels.length}개, dev 실패 ${failures.length}건`)

// ── 3. LLM 에 수정안 요청 ───────────────────────────────────────────────
const current = raw.categories.map((c) => ({ name: c.name, description: c.description }))

const prompt = `A personal bookmark manager auto-suggests a category for each saved bookmark. A small model picks one category from the user's list, guided by each category's short description (written by the user, in Korean). Some descriptions are missing or too narrow, so the model misfiles bookmarks.

Your job: propose revised category descriptions that would fix the kinds of mistakes shown below, without breaking categories that already work.

Current categories and descriptions:
${current.map((c) => `- ${c.name}: ${c.description || '(empty)'}`).join('\n')}

Bookmarks the model already classifies correctly (titles only) — the new descriptions must keep covering these:
${[...correctTitles].map(([k, ts]) => `[${k}]\n${ts.map((t) => `  - ${t}`).join('\n')}`).join('\n')}

Mistakes on a development sample (correct category per the user → what the model chose; "NONE" means the user considers that no category fits, and "null" means the model declined to choose):
${failures.map((f, i) => `${i + 1}. correct: ${f.gold} → model: ${f.pred ?? 'null'}\n   title: ${f.title}\n   body: ${f.body}`).join('\n')}

Rules:
- Keep every category name exactly as is. Do not add or remove categories.
- Write descriptions in Korean, one line each, at most 80 characters. They are shown in a small settings UI and sent to the model on every request.
- Describe the *scope* of each category and, where two categories are easily confused, say what distinguishes them. Generalize from the mistakes; do not mention specific bookmarks, people, works, or account names.
- Descriptions compete with each other: widening one category takes bookmarks away from others. Change only what the evidence supports and leave a description unchanged if it already works.
- Some mistakes may be caused by missing page content or by debatable labels rather than by the descriptions. Do not bend a description to fix those.

Reply with JSON only:
{"descriptions": {"<category name>": "<description>", ...}, "rationale": {"<category name>": "<one sentence in Korean: what changed and why, or '변경 없음'>", ...}}`

const apiKey = requireEnv('anthropicKey', 'Claude API 키가 필요합니다.')

async function callProposer(withFallbacks: boolean): Promise<Response> {
  const headers: Record<string, string> = {
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
    'content-type': 'application/json',
  }
  const body: Record<string, unknown> = {
    model: PROPOSER_MODEL,
    max_tokens: 16000,
    messages: [{ role: 'user', content: prompt }],
  }
  if (withFallbacks) {
    // 안전 분류기가 요청을 거절하면 서버가 다른 모델로 같은 요청을 다시 처리한다
    headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'
    body.fallbacks = 'default'
  }
  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300000),
  })
}

let res = await callProposer(true)
if (res.status === 400) {
  console.warn(`[propose] fallbacks 옵션이 거부됨 (${(await res.text()).slice(0, 160)}) → 옵션 없이 다시 요청`)
  res = await callProposer(false)
}
if (!res.ok) {
  console.error(`[propose] API 오류: HTTP ${res.status} ${(await res.text()).slice(0, 400)}`)
  process.exit(1)
}
const data: any = await res.json()
if (data.stop_reason === 'refusal') {
  console.error('[propose] 모델이 요청을 거절했습니다:', JSON.stringify(data.stop_details))
  process.exit(1)
}
const text = (data.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
const jsonText = extractJsonObject(text)
if (!jsonText) {
  console.error('[propose] 응답에서 JSON 을 찾지 못했습니다:\n', text.slice(0, 500))
  process.exit(1)
}
const out = JSON.parse(jsonText)
const proposed: Record<string, string> = {}
for (const c of current) {
  const d = out.descriptions?.[c.name]
  proposed[c.name] = typeof d === 'string' && d.trim() ? d.trim() : c.description
}
const unknown = Object.keys(out.descriptions ?? {}).filter((k) => !current.some((c) => c.name === k))
if (unknown.length) console.warn(`[propose] 목록에 없는 카테고리는 무시: ${unknown.join(', ')}`)

fs.writeFileSync(
  PROPOSED_PATH,
  JSON.stringify(
    {
      created_at: new Date().toISOString(),
      proposer_model: data.model ?? PROPOSER_MODEL,
      dev_size: devLabels.length,
      dev_failures: failures.length,
      original: Object.fromEntries(current.map((c) => [c.name, c.description])),
      proposed,
      rationale: out.rationale ?? {},
    },
    null,
    2,
  ),
  'utf8',
)

// ── 4. 사람이 볼 diff (비공개) ──────────────────────────────────────────
fs.mkdirSync(PRIVATE_DIR, { recursive: true })
const md = [
  `# 카테고리 설명 수정안 (비공개)`,
  ``,
  `수정안 생성 모델: ${data.model ?? PROPOSER_MODEL} / dev ${devLabels.length}개 중 실패 ${failures.length}건을 근거로 생성`,
  ``,
]
let changed = 0
for (const c of current) {
  const same = proposed[c.name] === c.description
  if (!same) changed++
  md.push(`## ${c.name}${same ? ' (변경 없음)' : ''}`, '```diff')
  if (same) md.push(`  ${c.description || '(비어 있음)'}`)
  else md.push(`- ${c.description || '(비어 있음)'}`, `+ ${proposed[c.name]}`)
  md.push('```', `이유: ${out.rationale?.[c.name] ?? '-'}`, ``)
}
fs.writeFileSync(path.join(PRIVATE_DIR, 'phase7_proposal.md'), md.join('\n'), 'utf8')

const u = data.usage ?? {}
console.log(`[propose] 수정안 저장: ${PROPOSED_PATH} (카테고리 ${current.length}개 중 ${changed}개 변경)`)
console.log(`[propose] diff: ${path.join(PRIVATE_DIR, 'phase7_proposal.md')}`)
console.log(`[propose] 토큰: 입력 ${u.input_tokens ?? '?'} / 출력 ${u.output_tokens ?? '?'}`)
