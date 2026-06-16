export type PageMeta = {
  url: string
  title: string
  description: string
  thumbnail: string
  siteName: string
  keywords: string[]
  bodyExcerpt: string
}

// 이 함수는 chrome.scripting.executeScript로 페이지 컨텍스트에서 실행됩니다.
// 외부 import 없이 완전히 독립적이어야 합니다.
export function extractPageMeta(): PageMeta {
  const getMeta = (selector: string) =>
    (document.querySelector(selector) as HTMLMetaElement | null)?.content ?? ''

  const thumbnail =
    getMeta('meta[property="og:image"]') ||
    getMeta('meta[name="twitter:image"]') ||
    ''

  // 트위터/X 아바타 도메인은 썸네일로 부적합하므로 제외
  const cleanThumbnail =
    thumbnail.includes('pbs.twimg.com/profile_images') ? '' : thumbnail

  // 키워드 수집 (meta keywords, article:tag, news_keywords)
  const keywordSet = new Set<string>()
  const kw = getMeta('meta[name="keywords"]')
  if (kw) kw.split(',').forEach((k) => { const t = k.trim(); if (t) keywordSet.add(t) })
  const nkw = getMeta('meta[name="news_keywords"]')
  if (nkw) nkw.split(',').forEach((k) => { const t = k.trim(); if (t) keywordSet.add(t) })
  document.querySelectorAll('meta[property="article:tag"]').forEach((el) => {
    const v = (el as HTMLMetaElement).content?.trim()
    if (v) keywordSet.add(v)
  })

  // 본문 추출: main > article > body
  const bodyEl =
    (document.querySelector('main') as HTMLElement | null) ||
    (document.querySelector('article') as HTMLElement | null) ||
    document.body
  const rawText = (bodyEl?.innerText ?? '').replace(/\s+/g, ' ').trim()
  const bodyExcerpt = rawText.slice(0, 800)

  return {
    url: location.href,
    title:
      getMeta('meta[property="og:title"]') ||
      getMeta('meta[name="twitter:title"]') ||
      document.title ||
      '',
    description:
      getMeta('meta[property="og:description"]') ||
      getMeta('meta[name="description"]') ||
      '',
    thumbnail: cleanThumbnail,
    siteName: getMeta('meta[property="og:site_name"]') || '',
    keywords: Array.from(keywordSet).slice(0, 20),
    bodyExcerpt,
  }
}
