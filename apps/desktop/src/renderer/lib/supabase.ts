import { createClient, SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

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
  created_at: string
}
