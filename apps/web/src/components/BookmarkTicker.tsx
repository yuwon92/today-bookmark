import { useMemo } from 'react'
import type { Bookmark } from '../lib/supabase'
import { getDomain } from '@bookmark-note/shared'

export function BookmarkTicker({ bookmarks }: { bookmarks: Bookmark[] }) {
  const shuffled = useMemo(() => {
    if (bookmarks.length === 0) return []
    return [...bookmarks].sort(() => Math.random() - 0.5).slice(0, 20)
  }, [bookmarks])

  if (shuffled.length === 0) return null

  const items = [...shuffled, ...shuffled]

  return (
    <div className="pixel-ticker">
      <div className="pixel-ticker-inner">
        {items.map((b, i) => (
          <span key={`${b.id}-${i}`}>
            <span
              className="pixel-ticker-item"
              onClick={() => window.open(b.url, '_blank', 'noopener,noreferrer')}
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
