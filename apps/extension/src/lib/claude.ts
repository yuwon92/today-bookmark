export async function suggestCategoryAndTags(params: {
  title: string
  url: string
  description: string
  existingCategories: string[]
  existingTags: string[]
}): Promise<{ category: string | null; tags: string[] }> {
  const apiKey = import.meta.env.VITE_CLAUDE_API_KEY
  if (!apiKey) return { category: null, tags: [] }

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
        max_tokens: 128,
        messages: [{
          role: 'user',
          content: `Suggest a category and tags for this bookmark.
Title: ${params.title}
URL: ${params.url}
Description: ${params.description}

Existing categories (pick one exactly as written, or null): ${params.existingCategories.join(', ') || 'none'}
Existing tags (prefer these, may add new short ones): ${params.existingTags.join(', ') || 'none'}

Reply in JSON only: {"category": "name_or_null", "tags": ["tag1", "tag2"]}`,
        }],
      }),
    })
    const data = await res.json()
    const raw = (data.content?.[0]?.text ?? '{}').trim()
    const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(text)
    return {
      category: typeof parsed.category === 'string' ? parsed.category : null,
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
    }
  } catch (e) {
    console.error('[claude.ts] fetch error', e)
    return { category: null, tags: [] }
  }
}
