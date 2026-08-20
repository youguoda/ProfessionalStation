import { describe, expect, it } from "vitest";
import type { MemoryNote } from "@/lib/domain/types";
import { searchMemoryNotes } from "./memory";

const notes: MemoryNote[] = [
  { id: "1", content: "用户喜欢早上 9 点以后开会", createdAt: "" },
  { id: "2", content: "用户偏好每天运动", createdAt: "" },
  { id: "3", content: "prefers deep work in the morning", createdAt: "" },
];

describe("searchMemoryNotes", () => {
  it("中文关键词命中", () => {
    const r = searchMemoryNotes(notes, "开会时间", 5);
    expect(r.map((n) => n.id)).toContain("1");
  });

  it("英文关键词命中", () => {
    const r = searchMemoryNotes(notes, "morning work", 5);
    expect(r.map((n) => n.id)).toContain("3");
  });

  it("无命中返回空数组", () => {
    expect(searchMemoryNotes(notes, "zzz", 5)).toEqual([]);
  });

  it("limit 生效", () => {
    expect(searchMemoryNotes(notes, "用户", 1)).toHaveLength(1);
  });

  it("空查询返回空数组", () => {
    expect(searchMemoryNotes(notes, "   ", 5)).toEqual([]);
  });
});
