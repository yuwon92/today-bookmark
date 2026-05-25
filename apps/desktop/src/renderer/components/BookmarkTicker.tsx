import { useMemo } from 'react'
import type { Bookmark } from '../lib/supabase'

function getDomain(url: string): string {
  try { return new URL(url).hostname } catch { return url }
}

export function BookmarkTicker({ bookmarks }: { bookmarks: Bookmark[] }) {
  // 최대 20개 랜덤 셔플, 앱 로드 시 1회 고정
  const shuffled = useMemo(() => {
    if (bookmarks.length === 0) return []
    return [...bookmarks]
      .sort(() => Math.random() - 0.5)
      .slice(0, 20)
  }, [bookmarks.length > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  if (shuffled.length === 0) return null

  // 무한 루프를 위해 2번 반복
  const items = [...shuffled, ...shuffled]

  return (
    <div className="pixel-ticker">
      <div className="pixel-ticker-inner">
        {items.map((b, i) => (
          <span key={`${b.id}-${i}`}>
            <span
              className="pixel-ticker-item"
              onClick={() => window.electron.openExternal(b.url)}
              title={b.url}
            >
              {b.title || getDomain(b.url)}
            </span>
            <span className="pixel-ticker-sep"> · </span>
          </span>
        ))}
      </div>
    </div>
  )
}
