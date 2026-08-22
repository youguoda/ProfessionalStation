import type { ClarifyTarget } from "./stateMachine";

/**
 * 澄清流的五个出口。前三个走状态机的 clarify 事件，
 * note（存成笔记）与 trash（删掉）是两个独立动作，由调用方处理。
 */
export type ClarifyChoice = ClarifyTarget | "note" | "trash";

export const CLARIFY_CHOICES: readonly {
  choice: ClarifyChoice;
  label: string;
  hint: string;
  /** 键盘快捷键 */
  key: string;
}[] = [
  { choice: "action", label: "现在要做", hint: "可以立即执行的下一步", key: "1" },
  { choice: "waiting", label: "等别人", hint: "球在别人手上，我要定期戳", key: "2" },
  { choice: "someday", label: "以后再说", hint: "现在不做，先留着", key: "3" },
  { choice: "note", label: "存成笔记", hint: "不是行动，只是要记住的信息", key: "4" },
  { choice: "trash", label: "删掉", hint: "根本不该存在", key: "5" },
];

const CLARIFY_TARGETS: readonly ClarifyTarget[] = ["action", "waiting", "someday"];

/** 解析拖放/键盘输入，仅合法澄清目标通过；其余一律 null（不动作） */
export function clarifyTargetFromDrop(data: unknown): ClarifyTarget | null {
  return CLARIFY_TARGETS.includes(data as ClarifyTarget) ? (data as ClarifyTarget) : null;
}

/** 按键 → 澄清选项；无匹配返回 null */
export function clarifyChoiceFromKey(key: string): ClarifyChoice | null {
  return CLARIFY_CHOICES.find((c) => c.key === key)?.choice ?? null;
}
