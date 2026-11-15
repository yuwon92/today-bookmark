// 버전 정의.
//
// 실제 git 히스토리에는 v0(4568d01)과 현재 버전(73dc486 + e0d0196) 두 개만 있다. 모든 개선이
// 한 커밋에 들어갔기 때문에, 중간 버전(v1, v1h, v2, v2s)은 "개선을 하나씩 얹은" 재구성 버전이다.
//
// | 버전    | 프롬프트 틀   | 입력                         | 카테고리      | few-shot           | 하이퍼파라미터            |
// |---------|--------------|------------------------------|---------------|--------------------|--------------------------|
// | v0      | 초기(단일 user) | title, url, description      | 이름만         | 없음               | max_tokens 128, temp 기본 |
// | v1      | 초기          | + site, keywords, body(X=Jina) | 이름만       | 없음               | 초기값, 태그 전체         |
// | v1h     | 초기          | v1 과 동일                    | 이름만         | 없음               | 400 / temp 0 / 태그 상위 50 |
// | v2      | 초기          | v1 과 동일                    | + description | 없음               | 최종값                    |
// | v2s     | 현재(system 분리) | v1 과 동일                 | + description | 없음               | 최종값                    |
// | v3      | 현재          | v1 과 동일                    | + description | 분류된 최근 5개     | 최종값 (= 현재 앱)        |
// | v3-bug  | 현재          | v1 과 동일                    | + description | 최근 5개 중 2개를 미분류로 | 최종값 (1차 회귀를 인위적으로 재현) |
//
// v2s 는 가이드 기본안에 없는 버전이다. system prompt 분리(+ "가능하면 카테고리를 고르라"는 규칙)와
// few-shot 의 효과를 따로 보기 위해 추가했다.

import type { Category, RawBookmark, Snapshot } from '../lib/data.ts'
import {
  SYSTEM_PROMPT, buildFewShot, buildUserMessage,
  type PageMeta, type RecentExample,
} from './appCode.ts'
import { parseFinal, parseV0, type Parsed } from './parsers.ts'

export type Msg = { role: 'user' | 'assistant'; content: string }

export type BuiltRequest = {
  system?: string
  messages: Msg[]
  max_tokens: number
  temperature?: number
  fewshot_ids: string[]
}

export type VersionInput = {
  snap: Snapshot
  categories: Category[]
  /** 대상보다 먼저 저장된 북마크, date_saved 내림차순 */
  prior: RawBookmark[]
}

export type Version = {
  name: string
  build: (input: VersionInput) => BuiltRequest
  /** 이 버전이 "원래" 쓰던 파서 (parse_ok_original 계산용) */
  parseOriginal: (raw: string) => Parsed
}

// ── 공통 헬퍼 ───────────────────────────────────────────────────────────

/** v0: `[...new Set(bookmarks.flatMap((b) => b.tags))]` — 정렬/제한 없음 */
function allTags(prior: RawBookmark[]): string[] {
  return [...new Set(prior.flatMap((b) => b.tags))]
}

/** 현재 앱(Popup.tsx): 빈도 내림차순. 상위 50개 자르기는 프롬프트 구성 쪽에서 한다. */
function tagsByFrequency(prior: RawBookmark[]): string[] {
  const tagCount = new Map<string, number>()
  for (const b of prior) {
    for (const t of b.tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1)
  }
  return Array.from(tagCount.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t)
}

function metaOf(snap: Snapshot): PageMeta {
  return {
    url: snap.url,
    title: snap.title,
    description: snap.description,
    thumbnail: '',
    siteName: snap.siteName,
    keywords: snap.keywords,
    bodyExcerpt: snap.bodyExcerpt,
  }
}

// ── 초기 프롬프트 틀 (커밋 4568d01 의 문구를 그대로 사용) ────────────────

type LegacyOpts = {
  extendedMeta: boolean
  categoryDescriptions: boolean
  finalHyperparams: boolean
}

function buildLegacy(input: VersionInput, o: LegacyOpts): BuiltRequest {
  const { snap, categories, prior } = input

  const lines = [
    `Suggest a category and tags for this bookmark.`,
    `Title: ${snap.title}`,
    `URL: ${snap.url}`,
    `Description: ${snap.description}`,
  ]
  if (o.extendedMeta) {
    if (snap.siteName) lines.push(`Site: ${snap.siteName}`)
    if (snap.keywords.length) lines.push(`Keywords: ${snap.keywords.join(', ')}`)
    if (snap.bodyExcerpt) lines.push(`Body: ${snap.bodyExcerpt.slice(0, 800)}`)
  }

  const catText = o.categoryDescriptions
    ? categories.length
      ? '\n' + categories.map((c) => `- ${c.name}${c.description ? `: ${c.description}` : ''}`).join('\n')
      : ' none'
    : ' ' + (categories.map((c) => c.name).join(', ') || 'none')

  const tags = o.finalHyperparams ? tagsByFrequency(prior).slice(0, 50) : allTags(prior)

  lines.push(
    ``,
    `Existing categories (pick one exactly as written, or null):${catText}`,
    `Existing tags (prefer these, may add new short ones): ${tags.join(', ') || 'none'}`,
    ``,
    `Reply in JSON only: {"category": "name_or_null", "tags": ["tag1", "tag2"]}`,
  )

  const req: BuiltRequest = {
    messages: [{ role: 'user', content: lines.join('\n') }],
    max_tokens: o.finalHyperparams ? 400 : 128,
    fewshot_ids: [],
  }
  if (o.finalHyperparams) req.temperature = 0
  return req
}

// ── 현재 프롬프트 틀 (appCode.ts = 앱 코드 복사본) ───────────────────────

type CurrentOpts = { fewShot: 'none' | 'categorized' | 'simulated-null' }

function buildCurrent(input: VersionInput, o: CurrentOpts): BuiltRequest {
  const { snap, categories, prior } = input
  const catNameById = new Map(categories.map((c) => [c.id, c.name]))

  let exampleRows: RawBookmark[] = []
  if (o.fewShot === 'categorized') {
    // Popup.tsx 와 동일: 카테고리가 분류된 최근 북마크만
    exampleRows = prior.filter((b) => b.category_id && catNameById.has(b.category_id)).slice(0, 5)
  } else if (o.fewShot === 'simulated-null') {
    // 1차 회귀 재현. 당시에는 미분류 북마크가 few-shot 에 섞였지만, 지금 DB 에는 미분류가 없어서
    // 필터만 꺼서는 재현되지 않는다. 그래서 최근 5개 중 2번째와 4번째를 미분류(category: null)로
    // 바꿔서 넣는다. 실제 당시 데이터가 아니라 인위적으로 만든 조건이다.
    exampleRows = prior.slice(0, 5)
  }
  const forceNull = (i: number) => o.fewShot === 'simulated-null' && (i === 1 || i === 3)
  const examples: RecentExample[] = exampleRows.map((b, i) => ({
    title: b.title,
    url: b.url,
    category: forceNull(i) ? null : (b.category_id && catNameById.get(b.category_id)) || null,
    tags: b.tags,
  }))

  const hints = categories.map((c) => ({ name: c.name, description: c.description }))
  return {
    system: SYSTEM_PROMPT,
    messages: [
      ...buildFewShot(examples, categories.map((c) => c.name)),
      { role: 'user', content: buildUserMessage(metaOf(snap), hints, tagsByFrequency(prior)) },
    ],
    max_tokens: 400,
    temperature: 0,
    fewshot_ids: exampleRows.map((b) => b.id),
  }
}

// ── 버전 목록 ───────────────────────────────────────────────────────────

export const VERSIONS: Record<string, Version> = {
  v0: {
    name: 'v0',
    build: (i) => buildLegacy(i, { extendedMeta: false, categoryDescriptions: false, finalHyperparams: false }),
    parseOriginal: parseV0,
  },
  v1: {
    name: 'v1',
    build: (i) => buildLegacy(i, { extendedMeta: true, categoryDescriptions: false, finalHyperparams: false }),
    parseOriginal: parseV0,
  },
  v1h: {
    name: 'v1h',
    build: (i) => buildLegacy(i, { extendedMeta: true, categoryDescriptions: false, finalHyperparams: true }),
    parseOriginal: parseV0,
  },
  v2: {
    name: 'v2',
    build: (i) => buildLegacy(i, { extendedMeta: true, categoryDescriptions: true, finalHyperparams: true }),
    parseOriginal: parseV0,
  },
  v2s: {
    name: 'v2s',
    build: (i) => buildCurrent(i, { fewShot: 'none' }),
    parseOriginal: parseFinal,
  },
  v3: {
    name: 'v3',
    build: (i) => buildCurrent(i, { fewShot: 'categorized' }),
    parseOriginal: parseFinal,
  },
  // Phase 7: v3 와 같고 카테고리 설명만 수정안(data/descriptions_proposed.json)으로 바꾼 버전.
  // 설명 교체는 03_run.ts 가 한다.
  v3d: {
    name: 'v3d',
    build: (i) => buildCurrent(i, { fewShot: 'categorized' }),
    parseOriginal: parseFinal,
  },
  'v3-bug': {
    name: 'v3-bug',
    build: (i) => buildCurrent(i, { fewShot: 'simulated-null' }),
    parseOriginal: parseFinal,
  },
}
