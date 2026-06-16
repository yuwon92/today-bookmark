const X_HOSTS = ['x.com', 'twitter.com', 'mobile.twitter.com']

export function isXUrl(url: string): boolean {
  try {
    return X_HOSTS.includes(new URL(url).hostname.replace(/^www\./, ''))
  } catch {
    return false
  }
}

// r.jina.ai는 URL prefix만 붙여 GET하면 본문(markdown/plain text)을 반환한다.
// API 키 없이도 동작하지만 레이트 제한이 낮다. 키가 있으면 Authorization 헤더로 전달.
// CORS 허용됨.
export async function fetchJinaContent(url: string, maxChars = 1500): Promise<string> {
  const apiKey = import.meta.env.VITE_JINA_API_KEY
  const headers: Record<string, string> = {
    'Accept': 'text/plain',
    'X-Return-Format': 'text',
  }
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

  try {
    const res = await fetch(`https://r.jina.ai/${url}`, { headers })
    if (!res.ok) return ''
    const text = await res.text()
    return text.replace(/\s+/g, ' ').trim().slice(0, maxChars)
  } catch {
    return ''
  }
}
