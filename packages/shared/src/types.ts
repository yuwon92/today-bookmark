export type Bookmark = {
  id: string
  user_id: string
  url: string
  title: string
  description: string
  thumbnail: string
  category_id: string | null
  note: string
  tags: string[]
  is_favorite: boolean
  date_saved: string
}

export type Category = {
  id: string
  user_id: string
  name: string
  color: string
  description: string
  created_at: string
}

export type BookmarkInsert = Omit<Bookmark, 'id' | 'date_saved'> & { date_saved?: string }
