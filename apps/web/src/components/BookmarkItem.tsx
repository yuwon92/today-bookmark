import { useEffect, useRef } from 'react'
import type { Bookmark, Category } from '../lib/supabase'
import { getDomain } from '@bookmark-note/shared'

export function BookmarkItem({
  bookmark, category, activeTag,
  onToggleFavorite, onDelete, onTagClick, onSelect,
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

  useEffect(() => {
    return () => { if (clickTimer.current) clearTimeout(clickTimer.current) }
  }, [])

  const handleClick = () => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current)
      clickTimer.current = null
      window.open(bookmark.url, '_blank', 'noopener,noreferrer')
    } else {
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null
        onSelect(bookmark)
      }, 300)
    }
  }

  return (
    <div className="pixel-bookmark-item">
      <button
        onClick={(e) => { e.stopPropagation(); onToggleFavorite(bookmark) }}
        className={`bookmark-star-btn${bookmark.is_favorite ? ' active' : ''}`}
        title={bookmark.is_favorite ? '즐겨찾기 해제' : '즐겨찾기'}
      >
        {bookmark.is_favorite ? '★' : '☆'}
      </button>

      <img
        src={favicon} alt=""
        className="bookmark-favicon"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
      />

      <div className="bookmark-main" onClick={handleClick}>
        <div className="bookmark-title">{bookmark.title || domain}</div>
        <div className="bookmark-meta-line">
          <span className="bookmark-domain">{domain}</span>
          {category && (
            <span className="bookmark-category" style={{ background: category.color }}>
              {category.name}
            </span>
          )}
        </div>
        {bookmark.note && (
          <div className="bookmark-note">📝 {bookmark.note}</div>
        )}
        {bookmark.tags.length > 0 && (
          <div className="bookmark-tags">
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

      <button
        onClick={(e) => { e.stopPropagation(); onDelete(bookmark) }}
        className="bookmark-delete-btn" title="삭제"
      >
        ✕
      </button>
    </div>
  )
}
