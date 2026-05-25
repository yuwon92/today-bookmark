import { createClient, SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// chrome.storage.local 기반 스토리지 어댑터 (popup + service worker 모두 동작)
const chromeStorage = {
  getItem: (key: string): Promise<string | null> =>
    new Promise((resolve) => {
      chrome.storage.local.get([key], (result) => resolve(result[key] ?? null))
    }),
  setItem: (key: string, value: string): Promise<void> =>
    new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, resolve)
    }),
  removeItem: (key: string): Promise<void> =>
    new Promise((resolve) => {
      chrome.storage.local.remove([key], resolve)
    }),
}

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: chromeStorage,
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

export type BookmarkInsert = {
  user_id: string
  url: string
  title: string
  description: string
  thumbnail: string
  category_id?: string | null
  note?: string
  tags?: string[]
}
