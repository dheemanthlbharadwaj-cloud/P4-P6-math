// Native stub: printing is a web feature (the dashboard itself only runs on the web).
import type { ClassDoc, ClassTask } from "@p6/shared";

export type PrintMode = "sheet" | "key" | "both";
export function PrintSheet(_p: { cls: ClassDoc; task: ClassTask; mode: PrintMode; onMode: (m: PrintMode) => void; onBack: () => void }): null {
  return null;
}
