import type { Bookmark, Category } from '../lib/supabase'

function getDomain(url: string): string {
  try { return new URL(url).hostname } catch { return url }
}

export function RandomBanner({
  bookmark,
  categories,
  onReroll,
}: {
  bookmark: Bookmark | null
  categories: Category[]
  onReroll: () => void
}) {
  if (!bookmark) return null

  const domain = getDomain(bookmark.url)
  const category = bookmark.category_id
    ? categories.find((item) => item.id === bookmark.category_id)
    : undefined
  const visibleTags = bookmark.tags.slice(0, 3)
  const hiddenTagCount = Math.max(bookmark.tags.length - visibleTags.length, 0)

  return (
    <div className="pixel-banner">
      <div
        className="pixel-banner-accent"
        style={{ background: category?.color ?? 'var(--accent)' }}
      />
      <div className="pixel-banner-header">
        <span className="pixel-banner-kicker">TODAY PICK</span>
        <span className="pixel-banner-heading">오늘의 추천 북마크</span>
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
        <div className="pixel-banner-text">
          <div className="pixel-banner-title">
            {bookmark.title || domain}
          </div>
          <div className="pixel-banner-meta">
            <span className="pixel-banner-domain">{domain}</span>
            {category && (
              <span className="pixel-banner-category" style={{ background: category.color }}>
                {category.name}
              </span>
            )}
            {visibleTags.map((tag) => (
              <span key={tag} className="pixel-tag">#{tag}</span>
            ))}
            {hiddenTagCount > 0 && (
              <span className="pixel-banner-more">+{hiddenTagCount}</span>
            )}
          </div>
        </div>
        <div className="pixel-banner-actions">
          {bookmark.is_favorite && (
            <span className="pixel-banner-star" title="즐겨찾기">★</span>
          )}
          <button
            className="pixel-btn pixel-btn-primary"
            style={{ fontSize: 10, padding: '2px 8px' }}
            onClick={() => window.electron.openExternal(bookmark.url)}
          >
            [ 열기 ]
          </button>
        </div>
      </div>
    </div>
  )
}
