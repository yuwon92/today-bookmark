"""버전별 지표 계산 + 그래프.

사용: python analysis/analyze.py

입력 (비공개):  data/labels.csv, data/bookmarks_raw.json, runs/<version>.jsonl
출력 (공개 가능): results/metrics.csv, results/mcnemar.csv, results/subgroup_*.csv,
                  results/metrics_table.md, results/*.png
출력 (비공개):  runs/analysis_private/  — 카테고리 이름이나 개별 북마크가 드러나는 표
"""
from __future__ import annotations

import json
import math
import os
import re
import sys
from collections import Counter
from pathlib import Path

import pandas as pd

EVAL_ROOT = Path(__file__).resolve().parent.parent
WORK = Path(os.environ["EVAL_WORK_DIR"]).resolve() if os.environ.get("EVAL_WORK_DIR") else EVAL_ROOT
DATA_DIR, RUNS_DIR, RESULTS_DIR = WORK / "data", WORK / "runs", WORK / "results"
PRIVATE_DIR = RUNS_DIR / "analysis_private"

VERSION_ORDER = ["v0", "v1", "v1h", "v2", "v2s", "v3", "v3-bug"]
# 인접 비교 (McNemar). v3-bug 는 v3 와, 그리고 처음과 끝을 직접 비교한다.
PAIRS = [("v0", "v1"), ("v1", "v1h"), ("v1h", "v2"), ("v2", "v2s"), ("v2s", "v3"), ("v3-bug", "v3"), ("v0", "v3")]
PRICE_PER_MTOK = {"input": 1.0, "output": 5.0}  # config.ts 와 동일 (Claude Haiku 4.5)

X_RE = re.compile(r"^https?://(www\.|mobile\.)?(x|twitter)\.com/", re.I)
NULL, PARSE_FAIL = "__null__", "__parse_fail__"


# ── 통계 ────────────────────────────────────────────────────────────────
def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return (float("nan"), float("nan"))
    p = k / n
    denom = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return (max(0.0, center - half), min(1.0, center + half))


def mcnemar_exact(b: int, c: int) -> float:
    """양측 정확 McNemar 검정. b, c 는 두 버전의 결과가 엇갈린 쌍의 수."""
    n = b + c
    if n == 0:
        return 1.0
    k = min(b, c)
    tail = sum(math.comb(n, i) for i in range(k + 1)) / 2**n
    return min(1.0, 2 * tail)


# ── 로드 ────────────────────────────────────────────────────────────────
def load_labels() -> pd.DataFrame:
    df = pd.read_csv(DATA_DIR / "labels.csv", encoding="utf-8-sig", dtype=str, keep_default_na=False)
    pending = DATA_DIR / "labels_pending.csv"
    if pending.exists():
        extra = pd.read_csv(pending, encoding="utf-8-sig", dtype=str, keep_default_na=False)
        df = pd.concat([df, extra[~extra.bookmark_id.isin(df.bookmark_id)]], ignore_index=True)
    df = df[df.get("exclude", "") != "1"].copy()
    df["gold_category"] = df["gold_category"].str.strip()
    df["alt_category"] = df["alt_category"].str.strip()
    df["ambiguous"] = df["ambiguous"].str.strip() == "1"
    df["is_x"] = df["url"].map(lambda u: bool(X_RE.match(u)))
    df["gold_tags"] = df["gold_tags"].map(lambda s: {t.strip().lower() for t in re.split(r"[,;|]", s) if t.strip()})
    return df


def load_runs() -> pd.DataFrame:
    rows = []
    for f in sorted(RUNS_DIR.glob("*.jsonl")):
        with f.open(encoding="utf-8") as fh:
            for line in fh:
                if line.strip():
                    rows.append(json.loads(line))
    if not rows:
        sys.exit(f"runs/*.jsonl 이 없습니다: {RUNS_DIR}")
    df = pd.DataFrame(rows)
    # 같은 키가 중복 기록됐다면 마지막 것만 사용
    return df.drop_duplicates(subset=["version", "bookmark_id", "run"], keep="last")


# ── 결과 분류 ───────────────────────────────────────────────────────────
def pred_key(row) -> str:
    if not row["parse_ok"]:
        return PARSE_FAIL
    return row["pred_category"] if row["pred_category"] else NULL


def outcome(pred: str, gold: str, ambiguous: bool, alt: str) -> str:
    if pred == PARSE_FAIL:
        return "parse_fail"
    if gold == "NONE":
        return "reject_ok" if pred == NULL else "forced"
    if pred == NULL:
        return "miss"
    if pred == gold or (ambiguous and alt and pred == alt):
        return "correct"
    return "wrong"


def majority(keys: list[str]) -> str:
    """3회 반복의 다수결. 모두 다르면 첫 번째 실행 결과를 쓴다."""
    top, n = Counter(keys).most_common(1)[0]
    return top if n > len(keys) / 2 else keys[0]


def jaccard(a: set, b: set) -> float:
    return len(a & b) / len(a | b) if (a | b) else float("nan")


def pct(x: float) -> str:
    return "-" if x != x else f"{x * 100:.1f}%"


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # Windows 콘솔(cp949)에서 한글 깨짐 방지
    labels = load_labels()
    runs = load_runs()
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    PRIVATE_DIR.mkdir(parents=True, exist_ok=True)

    df = runs.merge(labels, on="bookmark_id", how="inner")
    if df.empty:
        sys.exit("runs 와 labels 에 공통 bookmark_id 가 없습니다.")
    df["pred_key"] = df.apply(pred_key, axis=1)
    df["outcome"] = [outcome(p, g, a, alt) for p, g, a, alt in zip(df.pred_key, df.gold_category, df.ambiguous, df.alt_category)]
    df["cost"] = (df.input_tokens * PRICE_PER_MTOK["input"] + df.output_tokens * PRICE_PER_MTOK["output"]) / 1e6
    df["tag_jaccard"] = [
        jaccard(g, {str(t).strip().lower() for t in (p or [])}) if g else float("nan")
        for g, p in zip(df.gold_tags, df.pred_tags)
    ]

    versions = [v for v in VERSION_ORDER if v in set(df.version)] + sorted(set(df.version) - set(VERSION_ORDER))

    # 북마크 단위 (다수결)
    maj = (
        df.sort_values("run")
        .groupby(["version", "bookmark_id"])
        .agg(pred_key=("pred_key", lambda s: majority(list(s))), consistent=("pred_key", lambda s: s.nunique() == 1), n_runs=("run", "count"))
        .reset_index()
        .merge(labels, on="bookmark_id")
    )
    maj["outcome"] = [outcome(p, g, a, alt) for p, g, a, alt in zip(maj.pred_key, maj.gold_category, maj.ambiguous, maj.alt_category)]

    # ── 5-2. 버전별 지표 ────────────────────────────────────────────────
    rows = []
    for v in versions:
        d, m = df[df.version == v], maj[maj.version == v]
        dg, dn = d[d.gold_category != "NONE"], d[d.gold_category == "NONE"]
        mg, mn = m[m.gold_category != "NONE"], m[m.gold_category == "NONE"]
        k, n = int((mg.outcome == "correct").sum()), len(mg)
        lo, hi = wilson(k, n)
        fk, fn = int((mn.outcome == "forced").sum()), len(mn)
        flo, fhi = wilson(fk, fn)
        rows.append({
            "version": v,
            "n_bookmarks": m.bookmark_id.nunique(),
            "n_gold": n,
            "n_none": fn,
            "runs_per_bookmark": round(d.groupby("bookmark_id").run.count().mean(), 2),
            # 다수결 기준 (신뢰구간, 검정에 사용)
            "accuracy": k / n if n else float("nan"),
            "acc_ci_low": lo,
            "acc_ci_high": hi,
            "wrong_rate": (mg.outcome == "wrong").mean() if n else float("nan"),
            "miss_rate": (mg.outcome == "miss").mean() if n else float("nan"),
            "parse_fail_rate": (mg.outcome == "parse_fail").mean() if n else float("nan"),
            "forced_rate": fk / fn if fn else float("nan"),
            "forced_ci_low": flo,
            "forced_ci_high": fhi,
            # 호출 단위 (모든 반복의 평균)
            "accuracy_per_call": (dg.outcome == "correct").mean() if len(dg) else float("nan"),
            "miss_rate_per_call": (dg.outcome == "miss").mean() if len(dg) else float("nan"),
            "forced_rate_per_call": (dn.outcome == "forced").mean() if len(dn) else float("nan"),
            "parse_fail_final_parser": 1 - d.parse_ok.mean(),
            "parse_fail_original_parser": 1 - d.parse_ok_original.mean(),
            "invalid_category_rate": d.invalid_category.mean() if "invalid_category" in d else float("nan"),
            "truncated_rate": (d.stop_reason == "max_tokens").mean() if "stop_reason" in d else float("nan"),
            "consistency": m.consistent.mean(),
            "tag_jaccard": d.tag_jaccard.mean(),
            "avg_input_tokens": d.input_tokens.mean(),
            "avg_output_tokens": d.output_tokens.mean(),
            "cost_per_call_usd": d.cost.mean(),
            "latency_p50_ms": d.latency_ms.median(),
            "latency_p90_ms": d.latency_ms.quantile(0.9),
        })
    metrics = pd.DataFrame(rows)
    metrics.to_csv(RESULTS_DIR / "metrics.csv", index=False, encoding="utf-8-sig")

    # ── 5-4. McNemar ────────────────────────────────────────────────────
    gold_maj = maj[maj.gold_category != "NONE"]
    correct = gold_maj.assign(ok=gold_maj.outcome == "correct").pivot(index="bookmark_id", columns="version", values="ok")
    mc = []
    for a, b in PAIRS:
        if a not in correct or b not in correct:
            continue
        both = correct[[a, b]].dropna()
        only_a = int((both[a] & ~both[b].astype(bool)).sum())
        only_b = int((~both[a].astype(bool) & both[b]).sum())
        mc.append({
            "from": a, "to": b, "n": len(both),
            "acc_from": both[a].mean(), "acc_to": both[b].mean(),
            "diff_pp": (both[b].mean() - both[a].mean()) * 100,
            "fixed": only_b, "broken": only_a,
            "p_value": mcnemar_exact(only_a, only_b),
        })
    mcdf = pd.DataFrame(mc)
    mcdf.to_csv(RESULTS_DIR / "mcnemar.csv", index=False, encoding="utf-8-sig")

    # ── 5-3. 하위 그룹 ──────────────────────────────────────────────────
    def subgroup(col: str) -> pd.DataFrame:
        out = []
        for (v, g), m in gold_maj.groupby(["version", col]):
            k, n = int((m.outcome == "correct").sum()), len(m)
            lo, hi = wilson(k, n)
            out.append({"version": v, col: g, "n": n, "accuracy": k / n, "ci_low": lo, "ci_high": hi,
                        "wrong_rate": (m.outcome == "wrong").mean(), "miss_rate": (m.outcome == "miss").mean()})
        res = pd.DataFrame(out)
        if not res.empty:
            res["_o"] = res.version.map({v: i for i, v in enumerate(versions)})
            res = res.sort_values(["_o", col]).drop(columns="_o")
        return res

    subgroup("is_x").to_csv(RESULTS_DIR / "subgroup_x.csv", index=False, encoding="utf-8-sig")
    subgroup("label_source").to_csv(RESULTS_DIR / "subgroup_label_source.csv", index=False, encoding="utf-8-sig")
    # 카테고리별: 실제 이름은 비공개 폴더에, 공개용은 별칭(data/category_alias.json)을 적용해서 쓴다
    by_cat = subgroup("gold_category")
    by_cat.to_csv(PRIVATE_DIR / "by_category.csv", index=False, encoding="utf-8-sig")
    alias_path = DATA_DIR / "category_alias.json"
    alias = json.loads(alias_path.read_text(encoding="utf-8")) if alias_path.exists() else {}
    if not by_cat.empty:
        public = by_cat.assign(gold_category=by_cat.gold_category.replace(alias)).rename(columns={"gold_category": "category"})
        public.to_csv(RESULTS_DIR / "subgroup_category.csv", index=False, encoding="utf-8-sig")

    # ── 5-5. 오류 분석용 덤프 (비공개) ──────────────────────────────────
    last = "v3" if "v3" in versions else versions[-1]
    err = maj[(maj.version == last) & ~maj.outcome.isin(["correct", "reject_ok"])].copy()
    err["pred"] = err.pred_key
    err["cause"] = ""  # 사람이 채우는 칸: 입력 부족 / 경계 애매 / few-shot 영향 / 설명 부정확 / 라벨 오류
    err[["bookmark_id", "url", "title", "gold_category", "alt_category", "pred", "outcome", "consistent", "label_source", "cause"]].to_csv(
        PRIVATE_DIR / f"{last}_errors.csv", index=False, encoding="utf-8-sig")

    # ── 표 (markdown) ───────────────────────────────────────────────────
    lines = [
        "| 버전 | 정확도 (95% CI) | 오선택 | 누락 | 파싱 실패 (최종/원래 파서) | 억지 배정 | 일관성 | 태그 Jaccard | 입력/출력 토큰 | 건당 비용 | 응답 p50/p90 |",
        "|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for r in rows:
        lines.append(
            f"| {r['version']} | {pct(r['accuracy'])} ({pct(r['acc_ci_low'])}~{pct(r['acc_ci_high'])}) | {pct(r['wrong_rate'])} | {pct(r['miss_rate'])} "
            f"| {pct(r['parse_fail_final_parser'])} / {pct(r['parse_fail_original_parser'])} | {pct(r['forced_rate'])} | {pct(r['consistency'])} "
            f"| {'-' if r['tag_jaccard'] != r['tag_jaccard'] else format(r['tag_jaccard'], '.2f')} | {r['avg_input_tokens']:.0f} / {r['avg_output_tokens']:.0f} "
            f"| ${r['cost_per_call_usd']:.5f} | {r['latency_p50_ms']:.0f} / {r['latency_p90_ms']:.0f} ms |"
        )
    n_gold = int(metrics.n_gold.max())
    n_none = int(metrics.n_none.max())
    lines += ["", f"정확도, 오선택, 누락은 정답이 있는 북마크 {n_gold}개 기준 (반복 실행의 다수결). 억지 배정은 NONE 북마크 {n_none}개 기준.", ""]
    if not mcdf.empty:
        lines += ["| 비교 | 정확도 변화 | 고쳐짐 / 망가짐 | McNemar p |", "|---|---|---|---|"]
        for r in mc:
            lines.append(f"| {r['from']} → {r['to']} | {r['diff_pp']:+.1f}%p | {r['fixed']} / {r['broken']} | {r['p_value']:.3f} |")
    (RESULTS_DIR / "metrics_table.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    make_charts(metrics, maj, versions)

    print("\n".join(lines))
    print(f"\n결과: {RESULTS_DIR}")
    print(f"비공개(카테고리별, 오류 목록): {PRIVATE_DIR}")


# ── 5-6. 그래프 ─────────────────────────────────────────────────────────
def make_charts(metrics: pd.DataFrame, maj: pd.DataFrame, versions: list[str]) -> None:
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from matplotlib import font_manager
    except ImportError:
        print("matplotlib 이 없어 그래프를 건너뜁니다: python -m pip install matplotlib")
        return

    INK, INK2, MUTED, GRID, AXIS, SURFACE = "#0b0b0b", "#52514e", "#898781", "#e1e0d9", "#c3c2b7", "#fcfcfb"
    BLUE, ORANGE, AQUA, YELLOW = "#2a78d6", "#eb6834", "#1baf7a", "#eda100"
    installed = {f.name for f in font_manager.fontManager.ttflist}
    korean = [f for f in ("Malgun Gothic", "AppleGothic", "NanumGothic") if f in installed]
    plt.rcParams.update({
        "font.family": korean + ["DejaVu Sans"],
        "axes.unicode_minus": False,
        "figure.facecolor": SURFACE, "axes.facecolor": SURFACE, "savefig.facecolor": SURFACE,
        "axes.edgecolor": AXIS, "axes.labelcolor": INK2, "text.color": INK,
        "xtick.color": INK2, "ytick.color": MUTED, "axes.spines.top": False, "axes.spines.right": False,
        "axes.spines.left": False, "axes.grid": True, "axes.grid.axis": "y", "grid.color": GRID, "grid.linewidth": 0.8,
        "axes.axisbelow": True, "ytick.left": False, "xtick.bottom": False,
    })
    m = metrics.set_index("version").loc[versions]
    x = range(len(versions))

    # 1) 버전별 정확도 + Wilson 95% 신뢰구간
    fig, ax = plt.subplots(figsize=(7.2, 4.2), dpi=160)
    acc = m.accuracy * 100
    yerr = [(m.accuracy - m.acc_ci_low) * 100, (m.acc_ci_high - m.accuracy) * 100]
    ax.bar(x, acc, width=0.55, color=BLUE)
    ax.errorbar(x, acc, yerr=yerr, fmt="none", ecolor=INK2, elinewidth=1.2, capsize=4)
    for i, (a, hi) in enumerate(zip(acc, m.acc_ci_high * 100)):
        ax.text(i, hi + 2, f"{a:.1f}%", ha="center", va="bottom", fontsize=10, color=INK)
    ax.set_xticks(list(x), versions)
    ax.set_ylim(0, 112)
    ax.set_yticks([0, 25, 50, 75, 100], ["0", "25", "50", "75", "100%"])
    n_gold = int(m.n_gold.max())
    ax.set_title(f"버전별 카테고리 정확도 (정답 있는 북마크 {n_gold}개, 오차 막대는 95% 신뢰구간)", loc="left", fontsize=11)
    fig.tight_layout()
    fig.savefig(RESULTS_DIR / "accuracy_by_version.png")
    plt.close(fig)

    # 2) 결과 구성 누적 막대
    gold = maj[maj.gold_category != "NONE"]
    parts = [("correct", "정답", BLUE, "#ffffff"), ("wrong", "오선택", ORANGE, "#ffffff"),
             ("miss", "누락 (null)", AQUA, "#ffffff"), ("parse_fail", "파싱 실패", YELLOW, INK)]
    share = {key: [(gold[gold.version == v].outcome == key).mean() * 100 for v in versions] for key, *_ in parts}
    fig, ax = plt.subplots(figsize=(7.2, 4.2), dpi=160)
    bottom = [0.0] * len(versions)
    for key, label, color, ink in parts:
        vals = share[key]
        ax.bar(x, vals, width=0.55, bottom=bottom, color=color, label=label, edgecolor=SURFACE, linewidth=1.5)
        for i, (v, b) in enumerate(zip(vals, bottom)):
            if v >= 6:
                ax.text(i, b + v / 2, f"{v:.0f}%", ha="center", va="center", fontsize=9, color=ink)
        bottom = [b + v for b, v in zip(bottom, vals)]
    ax.set_xticks(list(x), versions)
    ax.set_ylim(0, 100)
    ax.set_yticks([0, 25, 50, 75, 100], ["0", "25", "50", "75", "100%"])
    ax.set_title("버전별 결과 구성 (정답 있는 북마크, 반복 실행의 다수결)", loc="left", fontsize=11)
    ax.legend(ncol=4, frameon=False, loc="upper center", bbox_to_anchor=(0.5, -0.08), fontsize=9)
    fig.tight_layout()
    fig.savefig(RESULTS_DIR / "outcomes_by_version.png")
    plt.close(fig)

    # 3) 정확도 대비 건당 비용
    fig, ax = plt.subplots(figsize=(7.2, 4.2), dpi=160)
    cost_c = m.cost_per_call_usd * 100  # 센트
    ax.scatter(cost_c, acc, s=70, color=BLUE, edgecolor=SURFACE, linewidth=2, zorder=3)
    for v, cx, ay in zip(versions, cost_c, acc):
        ax.annotate(v, (cx, ay), xytext=(7, 5), textcoords="offset points", fontsize=10, color=INK)
    ax.grid(True, axis="both")
    ax.set_xlabel("건당 비용 (센트)")
    ax.set_xlim(0, max(cost_c) * 1.2)
    ax.set_ylim(0, 105)
    ax.set_yticks([0, 25, 50, 75, 100], ["0", "25", "50", "75", "100%"])
    ax.set_title("버전별 정확도와 건당 비용", loc="left", fontsize=11)
    fig.tight_layout()
    fig.savefig(RESULTS_DIR / "accuracy_vs_cost.png")
    plt.close(fig)


if __name__ == "__main__":
    main()
