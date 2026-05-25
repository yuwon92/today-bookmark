import { supabase } from '../lib/supabase'

// 25분마다 세션 갱신 (MV3 service worker 세션 만료 방지)
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('refresh-session', { periodInMinutes: 25 })
})

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'refresh-session') {
    await supabase.auth.getSession()
  }
})
