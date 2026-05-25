export type PageMeta = {
  url: string
  title: string
  description: string
  thumbnail: string
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
  }
}
