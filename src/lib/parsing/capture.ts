/**
 * 批量捕获：把多行输入拆成逐行任务标题（纯函数）。
 */

export function splitCapture(input: string): string[] {
  return input
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
