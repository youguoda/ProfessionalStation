import type { ClarifyTarget } from "./stateMachine";

/** 收件箱拖拽澄清的四个目标桶（供视图层渲染与下拉兜底复用文案） */
export const CLARIFY_BUCKETS: readonly {
  target: ClarifyTarget;
  label: string;
  hint: string;
}[] = [
  { target: "action", label: "下一步行动", hint: "可以立即执行的下一步" },
  { target: "waiting", label: "等待", hint: "等他人或依赖完成" },
  { target: "someday", label: "将来/也许", hint: "现在不做，先留着" },
  { target: "reference", label: "参考资料", hint: "不是行动，只是资料" },
];

const TARGETS: readonly ClarifyTarget[] = CLARIFY_BUCKETS.map((b) => b.target);

/** 解析拖放落点数据，仅合法澄清目标通过；其余一律 null（不动作） */
export function clarifyTargetFromDrop(data: unknown): ClarifyTarget | null {
  return TARGETS.includes(data as ClarifyTarget) ? (data as ClarifyTarget) : null;
}
