import type { Bookmark, Category } from '../lib/supabase'
import { BookmarkItem } from './BookmarkItem'

export function BookmarkList({
  bookmarks,
  categories,
  search,
  favoritesOnly,
  onToggleFavorite,
  onDelete,
}: {
  bookmarks: Bookmark[]
  categories: Category[]
  search: string
  favoritesOnly: boolean
  onToggleFavorite: (b: Bookmark) => void
  onDelete: (b: Bookmark) => void
}) {
  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]))

  const filtered = bookmarks
    .filter((b) => !favoritesOnly || b.is_favorite)
    .filter((b) => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        b.title.toLowerCase().includes(q) ||
        b.url.toLowerCase().includes(q) ||
        b.note.toLowerCase().includes(q)
      )
    })

  if (filtered.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%',
        color: '#8C80A8', fontSize: 11, gap: 8,
      }}>
        <div style={{ fontSize: 32 }}>{favoritesOnly ? '⭐' : '📋'}</div>
        <div>{favoritesOnly ? '즐겨찾기가 없습니다.' : search ? '검색 결과가 없습니다.' : '저장된 북마크가 없습니다.'}</div>
      </div>
    )
  }

  return (
    <div>
      {filtered.map((b) => (
        <BookmarkItem
          key={b.id}
          bookmark={b}
          category={b.category_id ? catMap[b.category_id] : undefined}
          onToggleFavorite={onToggleFavorite}
          onDelete={onDelete}
        />
      ))}
      <div className="pixel-statusbar">
        <span>●</span>
        <span>{filtered.length}개 {favoritesOnly ? '즐겨찾기' : '북마크'}</span>
      </div>
    </div>
  )
}
