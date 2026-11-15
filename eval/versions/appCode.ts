// 앱 코드(apps/extension/src/lib/claude.ts)에서 그대로 복사한 프롬프트 구성/파싱 로직.
//
// 앱 코드는 수정하지 않는다는 원칙 때문에 import 대신 복사했다 (원본 함수들이 export 되어 있지 않고
// import.meta.env 에 의존함). `// <<<APP` ~ `// APP>>>` 사이 블록은 scripts/00_check_sync.ts 가
// 원본과 글자 단위로 비교하므로, 앱 코드가 바뀌면 검사가 실패한다. 이 블록은 손으로 고치지 말 것.

export type PageMeta = {
  url: string
  title: string
  description: string
  thumbnail: string
  siteName: string
  keywords: string[]
  bodyExcerpt: string
}

// <<<APP
export type CategoryHint = { name: string; description?: string }
export type RecentExample = {
  title: string
  url: string
  category: string | null
  tags: string[]
}

export const SYSTEM_PROMPT = `You categorize web bookmarks for a personal bookmark manager.

Category rules (IMPORTANT):
- Pick exactly ONE category from the user's existing categories, using its exact spelling.
- STRONGLY prefer picking a category over returning null. If ANY listed category plausibly fits, pick the closest one.
- Only return null if NONE of the listed categories could reasonably contain this content — e.g. the bookmark is about a completely unrelated domain. "I'm not 100% sure" is NOT a reason for null.
- Never invent a new category name.

Tag rules:
- Suggest 2-5 short, lowercase tags.
- Prefer reusing existing tags from the tag pool; only add a new tag if no existing tag fits AND it adds clear value.
- Tags are lowercase nouns/keywords, no spaces (use hyphens), max 20 chars each.

Decision basis (in priority): title, page body excerpt, description, site, keywords. Respect category descriptions — they define each category's scope. For X/Twitter posts, the body excerpt contains the actual tweet text — read it carefully.

Always reply with JSON only: {"category": string|null, "tags": string[]}`

export function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

export function buildUserMessage(
  meta: PageMeta,
  categories: CategoryHint[],
  tagPool: string[],
): string {
  const catLines = categories.length
    ? categories.map((c) => `- ${c.name}${c.description ? `: ${c.description}` : ''}`).join('\n')
    : '(none — return null for category)'

  const tagLine = tagPool.length ? tagPool.slice(0, 50).join(', ') : '(none yet)'

  const parts = [
    `Categories:`,
    catLines,
    ``,
    `Tag pool (prefer these): ${tagLine}`,
    ``,
    `Page:`,
    `- title: ${meta.title || '(none)'}`,
    `- host: ${hostOf(meta.url)}`,
    `- url: ${meta.url}`,
  ]
  if (meta.siteName) parts.push(`- site: ${meta.siteName}`)
  if (meta.description) parts.push(`- description: ${meta.description}`)
  if (meta.keywords?.length) parts.push(`- keywords: ${meta.keywords.join(', ')}`)
  if (meta.bodyExcerpt) parts.push(`- body: ${meta.bodyExcerpt.slice(0, 800)}`)
  parts.push(
    ``,
    `Reminder: choose the closest category from [${categories.map((c) => c.name).join(', ') || 'none'}]. Only return null if truly none fit.`,
    `Reply with JSON only.`,
  )
  return parts.join('\n')
}

export function buildFewShot(
  examples: RecentExample[],
  categoryNames: string[],
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const msgs: Array<{ role: 'user' | 'assistant'; content: string }> = []
  const catLine = categoryNames.length ? categoryNames.join(', ') : 'none'
  for (const ex of examples.slice(0, 5)) {
    msgs.push({
      role: 'user',
      content: `Categories available: ${catLine}\nBookmark:\n- title: ${ex.title}\n- host: ${hostOf(ex.url)}\n\nWhat category and tags?`,
    })
    msgs.push({
      role: 'assistant',
      content: JSON.stringify({ category: ex.category, tags: ex.tags }),
    })
  }
  return msgs
}

// 응답 문자열에서 첫 번째 균형잡힌 JSON 객체를 추출. 문자열 안의 중괄호/이스케이프도 처리.
export function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (escape) { escape = false; continue }
    if (ch === '\\') { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}
// APP>>>
