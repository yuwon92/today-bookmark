import type { Bookmark, Category } from '../lib/supabase'
import { BookmarkItem } from './BookmarkItem'

export function BookmarkList({
  bookmarks,
  categories,
  search,
  favoritesOnly,
  activeTag,
  onToggleFavorite,
  onDelete,
  onTagClick,
  onSelect,
}: {
  bookmarks: Bookmark[]
  categories: Category[]
  search: string
  favoritesOnly: boolean
  activeTag: string | null
  onToggleFavorite: (b: Bookmark) => void
  onDelete: (b: Bookmark) => void
  onTagClick: (tag: string) => void
  onSelect: (b: Bookmark) => void
}) {
  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]))

  const filtered = bookmarks
    .filter((b) => !favoritesOnly || b.is_favorite)
    .filter((b) => {
      if (activeTag && !b.tags.includes(activeTag)) return false
      if (!search) return true
      const q = search.toLowerCase()
      return (
        b.title.toLowerCase().includes(q) ||
        b.url.toLowerCase().includes(q) ||
        b.note.toLowerCase().includes(q) ||
        b.tags.some((t) => t.toLowerCase().includes(q))
      )
    })

  const emptyMsg = activeTag
    ? `#${activeTag} 태그 북마크가 없습니다.`
    : favoritesOnly
    ? '즐겨찾기가 없습니다.'
    : search
    ? '검색 결과가 없습니다.'
    : '저장된 북마크가 없습니다.'

  return (
    <div>
      {/* 활성 태그 필터 칩 */}
      {activeTag && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '5px 8px', background: 'var(--win)',
          borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 10 }}>🏷</span>
          <span className="pixel-tag active">#{activeTag}</span>
          <button
            onClick={() => onTagClick(activeTag)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 10, color: '#8C80A8', padding: '0 2px', fontFamily: 'inherit',
            }}
            title="필터 해제"
          >
            ✕
          </button>
          <span style={{ fontSize: 10, color: '#8C80A8', marginLeft: 2 }}>
            {filtered.length}개
          </span>
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '40px 0',
          color: '#8C80A8', fontSize: 11, gap: 8,
        }}>
          <div style={{ fontSize: 32 }}>{activeTag ? '🏷' : favoritesOnly ? '⭐' : '📋'}</div>
          <div>{emptyMsg}</div>
        </div>
      ) : (
        <>
          {filtered.map((b) => (
            <BookmarkItem
              key={b.id}
              bookmark={b}
              category={b.category_id ? catMap[b.category_id] : undefined}
              activeTag={activeTag}
              onToggleFavorite={onToggleFavorite}
              onDelete={onDelete}
              onTagClick={onTagClick}
              onSelect={onSelect}
            />
          ))}
          <div className="pixel-statusbar">
            <span>●</span>
            <span>{filtered.length}개 {favoritesOnly ? '즐겨찾기' : '북마크'}</span>
          </div>
        </>
      )}
    </div>
  )
}
