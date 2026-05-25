import type { Bookmark } from '../lib/supabase'

function getDomain(url: string): string {
  try { return new URL(url).hostname } catch { return url }
}

export function RandomBanner({
  bookmark,
  onReroll,
}: {
  bookmark: Bookmark | null
  onReroll: () => void
}) {
  if (!bookmark) return null

  const domain = getDomain(bookmark.url)
  const favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`

  return (
    <div className="pixel-banner">
      <div className="pixel-banner-header">
        <span>🎲 오늘의 추천 북마크</span>
        <button
          className="pixel-btn"
          style={{ fontSize: 9, padding: '1px 6px' }}
          onClick={onReroll}
          title="다른 북마크 보기"
        >
          🔀
        </button>
      </div>

      <div className="pixel-banner-content">
        <img
          src={bookmark.thumbnail || favicon}
          alt=""
          className="pixel-banner-img"
          onError={(e) => {
            const img = e.target as HTMLImageElement
            if (img.src !== favicon) img.src = favicon
          }}
        />
        <div className="pixel-banner-text">
          <div className="pixel-banner-title">
            {bookmark.title || domain}
          </div>
          <div className="pixel-banner-domain">{domain}</div>
          {bookmark.note && (
            <div style={{ fontSize: 10, color: '#6B5FA0', marginTop: 3, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {bookmark.note}
            </div>
          )}
          <button
            className="pixel-btn pixel-btn-primary"
            style={{ fontSize: 10, padding: '2px 8px', marginTop: 5 }}
            onClick={() => window.electron.openExternal(bookmark.url)}
          >
            [ 열기 ]
          </button>
        </div>
      </div>
    </div>
  )
}
