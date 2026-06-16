import type { Bookmark } from './types'

export function filterBookmarks(
  bookmarks: Bookmark[],
  opts: { search: string; favoritesOnly: boolean; activeTag: string | null },
): Bookmark[] {
  return bookmarks
    .filter((b) => !opts.favoritesOnly || b.is_favorite)
    .filter((b) => {
      if (opts.activeTag && !b.tags.includes(opts.activeTag)) return false
      if (!opts.search) return true
      const q = opts.search.toLowerCase()
      return (
        b.title.toLowerCase().includes(q) ||
        b.url.toLowerCase().includes(q) ||
        b.note.toLowerCase().includes(q) ||
        b.tags.some((t) => t.toLowerCase().includes(q))
      )
    })
}
