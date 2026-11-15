import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const EVAL_ROOT = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(EVAL_ROOT, '..')

// EVAL_WORK_DIR 을 지정하면 data/runs/results 를 다른 위치에 둔다 (스모크 테스트용).
const WORK = process.env.EVAL_WORK_DIR ? path.resolve(process.env.EVAL_WORK_DIR) : EVAL_ROOT
export const DATA_DIR = path.join(WORK, 'data')
export const SNAPSHOT_DIR = path.join(DATA_DIR, 'snapshots')
export const RUNS_DIR = path.join(WORK, 'runs')
export const RESULTS_DIR = path.join(WORK, 'results')

export const RAW_PATH = path.join(DATA_DIR, 'bookmarks_raw.json')
export const LABELS_PATH = path.join(DATA_DIR, 'labels.csv')
// labels.csv 가 엑셀에 열려 있어 쓸 수 없을 때 새 행을 임시로 두는 파일. 다음 샘플링 때 합쳐진다.
export const LABELS_PENDING_PATH = path.join(DATA_DIR, 'labels_pending.csv')
export const EXTRA_LINKS_PATH = path.join(DATA_DIR, 'extra_links.csv')

// ── 모델 ───────────────────────────────────────────────────────────────
// 앱(apps/extension/src/lib/claude.ts)과 동일한 모델. 00_check_sync 가 일치 여부를 검사한다.
export const MODEL = 'claude-haiku-4-5-20251001'
export const ANTHROPIC_VERSION = '2023-06-01'
// USD / 1M tokens (Claude Haiku 4.5)
export const PRICE_PER_MTOK = { input: 1.0, output: 5.0 }
// Phase 7 에서 카테고리 설명 수정안을 만드는 모델 (1회 호출). 분류 자체는 계속 MODEL 로 한다.
export const PROPOSER_MODEL = 'claude-opus-5-5'

// ── 실행 ───────────────────────────────────────────────────────────────
export const RUNS = 3
export const CONCURRENCY = 4
export const MAX_RETRIES = 6

// ── 평가셋 ─────────────────────────────────────────────────────────────
// 여기에 적은 카테고리와 소속 북마크는 추출 단계에서 완전히 제외한다. 현재는 제외 없음.
export const EXCLUDED_CATEGORIES: string[] = []

export const SAMPLING = {
  seed: 20261115,
  // DB(기존 북마크)에서 뽑는 목표 개수. 사용자가 따로 주는 링크(extra_links.csv)는 별도로 추가된다.
  targetFromDb: 150,
  // 카테고리별 최소 개수. 이보다 작은 카테고리는 전부 포함.
  minPerCategory: 8,
}

// ── 스냅샷 ─────────────────────────────────────────────────────────────
export const SNAPSHOT = {
  bodyChars: 800, // extractPageMeta 의 bodyExcerpt 길이
  jinaChars: 1500, // fetchJinaContent 의 maxChars
  // 앱은 2.5초에서 끊지만, 평가에서는 입력을 안정적으로 확보하기 위해 길게 잡는다 (한계로 기록).
  jinaTimeoutMs: 30000,
  htmlTimeoutMs: 20000,
  jinaIntervalMs: 3500, // 키 없는 무료 티어(분당 20회) 기준
  jinaIntervalWithKeyMs: 400,
}

export const VERSION_ORDER = ['v0', 'v1', 'v1h', 'v2', 'v2s', 'v3', 'v3-bug'] as const
