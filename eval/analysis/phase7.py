"""Phase 7: 카테고리 설명 수정안의 전후 비교 (v3 = 현재 설명, v3d = 수정안).

사용: python analysis/phase7.py

출력 (공개 가능): results/phase7.csv, results/phase7_by_category.csv, results/phase7_table.md
  카테고리 이름에는 data/category_alias.json 의 별칭을 적용한다. 설명 문구는 쓰지 않는다.
설명 문구 diff 는 scripts/04_propose.ts 가 runs/analysis_private/phase7_proposal.md 에 쓴다 (비공개).
"""
from __future__ import annotations

import json
import sys

import pandas as pd

from analyze import DATA_DIR, RESULTS_DIR, RUNS_DIR, load_labels, majority, mcnemar_exact, outcome, pct, pred_key, wilson

BASE, NEW = "v3", "v3d"


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    labels = load_labels()
    split = pd.read_csv(DATA_DIR / "split.csv", encoding="utf-8-sig", dtype=str)
    prop = json.loads((DATA_DIR / "descriptions_proposed.json").read_text(encoding="utf-8"))
    alias_path = DATA_DIR / "category_alias.json"
    alias = json.loads(alias_path.read_text(encoding="utf-8")) if alias_path.exists() else {}
    changed = {k for k in prop["proposed"] if prop["proposed"][k] != prop["original"].get(k, "")}

    frames = []
    for v in (BASE, NEW):
        f = RUNS_DIR / f"{v}.jsonl"
        if not f.exists():
            sys.exit(f"{f} 가 없습니다.")
        frames.append(pd.read_json(f, lines=True))
    runs = pd.concat(frames).drop_duplicates(subset=["version", "bookmark_id", "run"], keep="last")
    runs["pred_key"] = runs.apply(pred_key, axis=1)

    maj = (
        runs.sort_values("run").groupby(["version", "bookmark_id"])
        .agg(pred_key=("pred_key", lambda s: majority(list(s)))).reset_index()
        .merge(labels, on="bookmark_id").merge(split, on="bookmark_id")
    )
    maj["outcome"] = [outcome(p, g, a, alt) for p, g, a, alt in zip(maj.pred_key, maj.gold_category, maj.ambiguous, maj.alt_category)]
    maj["ok"] = maj.outcome.isin(["correct", "reject_ok"])
    maj["group"] = maj.gold_category.map(lambda g: "NONE" if g == "NONE" else ("설명을 바꾼 카테고리" if g in changed else "설명을 안 바꾼 카테고리"))

    def compare(d: pd.DataFrame, label: str, scope: str) -> dict:
        p = d.pivot(index="bookmark_id", columns="version", values="ok").dropna()
        n = len(p)
        kb, kn = int(p[BASE].sum()), int(p[NEW].sum())
        fixed = int((~p[BASE].astype(bool) & p[NEW].astype(bool)).sum())
        broken = int((p[BASE].astype(bool) & ~p[NEW].astype(bool)).sum())
        lo_b, hi_b = wilson(kb, n)
        lo_n, hi_n = wilson(kn, n)
        return {"split": scope, "group": label, "n": n, "before": kb / n if n else float("nan"), "after": kn / n if n else float("nan"),
                "before_ci": f"{pct(lo_b)}~{pct(hi_b)}", "after_ci": f"{pct(lo_n)}~{pct(hi_n)}",
                "diff_pp": (kn - kb) / n * 100 if n else float("nan"), "fixed": fixed, "broken": broken, "p_value": mcnemar_exact(broken, fixed)}

    rows = []
    for scope in ("dev", "test"):
        d = maj[maj.split == scope]
        gold = d[d.gold_category != "NONE"]
        rows.append(compare(gold, "정답 있는 북마크 전체 (정확도)", scope))
        for g in ("설명을 바꾼 카테고리", "설명을 안 바꾼 카테고리"):
            if (gold.group == g).any():
                rows.append(compare(gold[gold.group == g], g, scope))
        rows.append(compare(d[d.gold_category == "NONE"], "NONE (정상 거부율)", scope))
    res = pd.DataFrame(rows)
    res.to_csv(RESULTS_DIR / "phase7.csv", index=False, encoding="utf-8-sig")

    cat_rows = []
    for scope in ("dev", "test"):
        d = maj[(maj.split == scope) & (maj.gold_category != "NONE")]
        for cat, g in d.groupby("gold_category"):
            r = compare(g, alias.get(cat, cat), scope)
            r["description_changed"] = cat in changed
            cat_rows.append(r)
    by_cat = pd.DataFrame(cat_rows).rename(columns={"group": "category"})
    by_cat.to_csv(RESULTS_DIR / "phase7_by_category.csv", index=False, encoding="utf-8-sig")

    lines = [
        f"수정안 생성 모델: {prop.get('proposer_model')} / dev {prop.get('dev_size')}개 중 실패 {prop.get('dev_failures')}건을 근거로 생성 / "
        f"카테고리 {len(prop['proposed'])}개 중 {len(changed)}개의 설명 변경",
        "",
        "| 셋 | 대상 | 개수 | 수정 전 | 수정 후 | 변화 | 고쳐짐 / 망가짐 | McNemar p |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for r in rows:
        lines.append(f"| {r['split']} | {r['group']} | {r['n']} | {pct(r['before'])} ({r['before_ci']}) | {pct(r['after'])} ({r['after_ci']}) "
                     f"| {r['diff_pp']:+.1f}%p | {r['fixed']} / {r['broken']} | {r['p_value']:.3f} |")
    lines += ["", "| 셋 | 카테고리 | 설명 변경 | 개수 | 수정 전 | 수정 후 | 고쳐짐 / 망가짐 |", "|---|---|---|---|---|---|---|"]
    for r in cat_rows:
        lines.append(f"| {r['split']} | {r['group']} | {'O' if r['description_changed'] else '-'} | {r['n']} | {pct(r['before'])} | {pct(r['after'])} | {r['fixed']} / {r['broken']} |")
    (RESULTS_DIR / "phase7_table.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
