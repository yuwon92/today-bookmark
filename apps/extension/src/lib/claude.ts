import type { PageMeta } from './metaParser'

export type CategoryHint = { name: string; description?: string }
export type RecentExample = {
  title: string
  url: string
  category: string | null
  tags: string[]
}

const SYSTEM_PROMPT = `You categorize web bookmarks for a personal bookmark manager.

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

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

function buildUserMessage(
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
  if (meta.bodyExcerpt) parts.push(`- body: ${meta.bodyExcerpt}`)
  parts.push(
    ``,
    `Reminder: choose the closest category from [${categories.map((c) => c.name).join(', ') || 'none'}]. Only return null if truly none fit.`,
    `Reply with JSON only.`,
  )
  return parts.join('\n')
}

function buildFewShot(
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

export async function suggestCategoryAndTags(params: {
  meta: PageMeta
  categories: CategoryHint[]
  tagPool: string[]
  recentExamples: RecentExample[]
}): Promise<{ category: string | null; tags: string[] }> {
  const apiKey = import.meta.env.VITE_CLAUDE_API_KEY
  if (!apiKey) return { category: null, tags: [] }

  const fewShot = buildFewShot(params.recentExamples, params.categories.map((c) => c.name))
  const userMsg = buildUserMessage(params.meta, params.categories, params.tagPool)

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [
          ...fewShot,
          { role: 'user', content: userMsg },
        ],
      }),
    })
    const data = await res.json()
    const raw = (data.content?.[0]?.text ?? '').trim()
    console.debug('[claude.ts] raw response:', raw)

    // 응답 텍스트에서 첫 `{` 부터 짝맞는 `}` 까지 JSON 추출 (코드블록/잡설 모두 허용)
    const jsonText = extractJsonObject(raw)
    if (!jsonText) {
      console.warn('[claude.ts] no JSON object in response')
      return { category: null, tags: [] }
    }
    const parsed = JSON.parse(jsonText)
    return {
      category: typeof parsed.category === 'string' ? parsed.category : null,
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
    }
  } catch (e) {
    console.error('[claude.ts] fetch/parse error', e)
    return { category: null, tags: [] }
  }
}

// 응답 문자열에서 첫 번째 균형잡힌 JSON 객체를 추출. 문자열 안의 중괄호/이스케이프도 처리.
function extractJsonObject(text: string): string | null {
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
