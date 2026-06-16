import type { SupabaseClient } from '@supabase/supabase-js'
import type { Bookmark, Category } from './types'

export async function loadBookmarksAndCategories(
  supabase: SupabaseClient,
): Promise<{ bookmarks: Bookmark[]; categories: Category[] }> {
  const [bRes, cRes] = await Promise.all([
    supabase.from('bookmarks').select('*').order('date_saved', { ascending: false }),
    supabase.from('categories').select('*').order('name'),
  ])
  if (bRes.error) throw bRes.error
  if (cRes.error) throw cRes.error
  return { bookmarks: bRes.data as Bookmark[], categories: cRes.data as Category[] }
}

export async function toggleFavorite(supabase: SupabaseClient, b: Bookmark): Promise<void> {
  const { error } = await supabase.from('bookmarks').update({ is_favorite: !b.is_favorite }).eq('id', b.id)
  if (error) throw error
}

export async function updateBookmark(
  supabase: SupabaseClient,
  id: string,
  changes: Partial<Bookmark>,
): Promise<void> {
  const { error } = await supabase.from('bookmarks').update(changes).eq('id', id)
  if (error) throw error
}

export async function deleteBookmarkById(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('bookmarks').delete().eq('id', id)
  if (error) throw error
}

export async function insertCategory(
  supabase: SupabaseClient,
  userId: string,
  name: string,
  color: string,
  description = '',
): Promise<void> {
  const { error } = await supabase
    .from('categories')
    .insert({ user_id: userId, name, color, description })
  if (error) throw error
}

export async function updateCategory(
  supabase: SupabaseClient,
  id: string,
  name: string,
  color: string,
  description = '',
): Promise<void> {
  const { error } = await supabase
    .from('categories')
    .update({ name, color, description })
    .eq('id', id)
  if (error) throw error
}

export async function deleteCategoryById(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) throw error
}
