import { describe, expect, it } from "vitest";
import {
  CLARIFY_CHOICES,
  clarifyChoiceFromKey,
  clarifyTargetFromDrop,
} from "./clarifyDrop";

describe("clarifyTargetFromDrop", () => {
  it.each(["action", "waiting", "someday"] as const)("%s 是合法澄清目标", (t) => {
    expect(clarifyTargetFromDrop(t)).toBe(t);
  });

  it("reference 已不再是澄清目标（改为独立的笔记实体）", () => {
    expect(clarifyTargetFromDrop("reference")).toBeNull();
  });

  it("非法数据返回 null（不动作）", () => {
    for (const bad of ["trash", "inbox", "done", "foo", 42, null, undefined, {}, { clarify: "action" }]) {
      expect(clarifyTargetFromDrop(bad)).toBeNull();
    }
  });
});

describe("澄清流的五个出口", () => {
  it("覆盖三个状态机目标 + 存成笔记 + 删掉", () => {
    expect(CLARIFY_CHOICES.map((c) => c.choice)).toEqual([
      "action",
      "waiting",
      "someday",
      "note",
      "trash",
    ]);
  });

  it("每个选项都有文案、提示与唯一快捷键", () => {
    const keys = new Set<string>();
    for (const c of CLARIFY_CHOICES) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.hint.length).toBeGreaterThan(0);
      expect(keys.has(c.key)).toBe(false);
      keys.add(c.key);
    }
    expect(keys.size).toBe(5);
  });
});

describe("clarifyChoiceFromKey", () => {
  it("数字键映射到对应选项", () => {
    expect(clarifyChoiceFromKey("1")).toBe("action");
    expect(clarifyChoiceFromKey("2")).toBe("waiting");
    expect(clarifyChoiceFromKey("3")).toBe("someday");
    expect(clarifyChoiceFromKey("4")).toBe("note");
    expect(clarifyChoiceFromKey("5")).toBe("trash");
  });

  it("其他按键返回 null", () => {
    for (const k of ["0", "6", "a", "Enter", ""]) {
      expect(clarifyChoiceFromKey(k)).toBeNull();
    }
  });
});
