import { describe, expect, it } from "vitest";
import { splitCapture } from "./capture";

describe("splitCapture 批量捕获拆分", () => {
  it("单行原样返回", () => {
    expect(splitCapture("买牛奶")).toEqual(["买牛奶"]);
  });

  it("多行拆分并去除空行与首尾空格", () => {
    expect(splitCapture("  买牛奶  \n\n写周报\n  开会 ")).toEqual(["买牛奶", "写周报", "开会"]);
  });

  it("空输入返回空数组", () => {
    expect(splitCapture("")).toEqual([]);
    expect(splitCapture("  \n  ")).toEqual([]);
  });
});
