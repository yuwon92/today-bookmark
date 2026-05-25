import { useRef } from 'react'
import type { Bookmark, Category } from '../lib/supabase'

function getDomain(url: string): string {
  try { return new URL(url).hostname } catch { return url }
}

export function BookmarkItem({
  bookmark,
  category,
  activeTag,
  onToggleFavorite,
  onDelete,
  onTagClick,
  onSelect,
}: {
  bookmark: Bookmark
  category: Category | undefined
  activeTag: string | null
  onToggleFavorite: (b: Bookmark) => void
  onDelete: (b: Bookmark) => void
  onTagClick: (tag: string) => void
  onSelect: (b: Bookmark) => void
}) {
  const domain = getDomain(bookmark.url)
  const favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=16`
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleClick = () => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current)
      clickTimer.current = null
      window.electron.openExternal(bookmark.url)
    } else {
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null
        onSelect(bookmark)
      }, 300)
    }
  }

  return (
    <div className="pixel-bookmark-item">
      {/* 즐겨찾기 */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleFavorite(bookmark) }}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 14, lineHeight: 1, padding: '0 2px',
          color: bookmark.is_favorite ? '#FFB800' : '#C0B8D8',
          flexShrink: 0,
        }}
        title={bookmark.is_favorite ? '즐겨찾기 해제' : '즐겨찾기'}
      >
        {bookmark.is_favorite ? '★' : '☆'}
      </button>

      {/* 파비콘 */}
      <img
        src={favicon}
        alt=""
        style={{
          width: 16, height: 16, objectFit: 'cover',
          flexShrink: 0, marginTop: 1,
          border: '1px solid var(--border)',
        }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
      />

      {/* 내용 — 단일클릭: 상세 패널 / 더블클릭: URL 열기 */}
      <div
        style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
        onClick={handleClick}
      >
        <div style={{
          fontWeight: 'bold', fontSize: 11,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {bookmark.title || domain}
        </div>
        <div style={{
          fontSize: 10, color: '#8C80A8',
          display: 'flex', gap: 4, alignItems: 'center', marginTop: 1,
        }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
            {domain}
          </span>
          {category && (
            <span style={{
              background: category.color,
              border: '1px solid var(--border)',
              padding: '0 3px', fontSize: 9,
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              {category.name}
            </span>
          )}
        </div>
        {bookmark.note && (
          <div style={{
            fontSize: 10, color: '#6B5FA0', marginTop: 2,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            📝 {bookmark.note}
          </div>
        )}
        {bookmark.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 3 }}>
            {bookmark.tags.map((tag) => (
              <span
                key={tag}
                className={`pixel-tag${activeTag === tag ? ' active' : ''}`}
                onClick={(e) => { e.stopPropagation(); onTagClick(tag) }}
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 삭제 */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(bookmark) }}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#8C80A8', fontSize: 12, padding: '0 2px', flexShrink: 0,
        }}
        title="삭제"
      >
        ✕
      </button>
    </div>
  )
}
