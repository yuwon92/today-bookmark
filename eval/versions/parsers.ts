import { extractJsonObject } from './appCode.ts'

export type Parsed = { ok: boolean; category: string | null; tags: string[] }

function shape(parsed: any): Parsed {
  return {
    ok: true,
    category: typeof parsed?.category === 'string' ? parsed.category : null,
    tags: Array.isArray(parsed?.tags) ? parsed.tags.map(String) : [],
  }
}

const FAIL: Parsed = { ok: false, category: null, tags: [] }

/** 현재 앱의 파서: 첫 번째 균형 잡힌 JSON 객체를 추출 후 JSON.parse. 모든 버전의 주 비교에 사용. */
export function parseFinal(raw: string): Parsed {
  const jsonText = extractJsonObject(raw.trim())
  if (!jsonText) return FAIL
  try { return shape(JSON.parse(jsonText)) } catch { return FAIL }
}

/** 초기 버전(커밋 4568d01)의 파서: 코드펜스만 벗기고 전체를 JSON.parse. */
export function parseV0(raw: string): Parsed {
  const text = (raw || '{}').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try { return shape(JSON.parse(text)) } catch { return FAIL }
}
