export const PACK_LIMIT: number;
export const DEFAULT_CONTENT_ROOT: string;
export function parseWebpSize(buf: Uint8Array): { width: number; height: number };
export function packFigures(
  figs: { id: string; data: Buffer }[],
  limit?: number,
): { packs: Buffer[]; index: Record<string, [number, number, number, number, number]> };
export function buildFigpacks(opts?: { contentRoot?: string; force?: boolean }): Record<
  string,
  { built: boolean; figures: number; packs: number; bytes?: number; hash: string }
>;
