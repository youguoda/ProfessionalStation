import { describe, expect, it } from "vitest";
import { CLARIFY_BUCKETS, clarifyTargetFromDrop } from "./clarifyDrop";

describe("clarifyTargetFromDrop", () => {
  it.each(["action", "waiting", "someday", "reference"] as const)(
    "%s 是合法澄清目标",
    (t) => {
      expect(clarifyTargetFromDrop(t)).toBe(t);
    },
  );

  it("非法数据返回 null（不动作）", () => {
    for (const bad of ["trash", "inbox", "done", "foo", 42, null, undefined, {}, { clarify: "action" }]) {
      expect(clarifyTargetFromDrop(bad)).toBeNull();
    }
  });

  it("澄清桶配置覆盖全部 4 个合法目标", () => {
    expect(CLARIFY_BUCKETS.map((b) => b.target).sort()).toEqual([
      "action",
      "reference",
      "someday",
      "waiting",
    ]);
    for (const b of CLARIFY_BUCKETS) {
      expect(b.label.length).toBeGreaterThan(0);
      expect(b.hint.length).toBeGreaterThan(0);
    }
  });
});
