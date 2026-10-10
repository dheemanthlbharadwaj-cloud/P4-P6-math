// Screen size classes (see theme/layout.ts). Pure, so it can be unit tested.
export type ScreenClass = "phone" | "tablet" | "desktop";

export function screenClass(width: number, height: number): ScreenClass {
  if (width >= 1100 && height >= 560) return "desktop";
  if (width >= 700 && height >= 500) return "tablet";
  return "phone";
}

/** Width of the side navigation on tablets and desktops (0 on phones). */
export const SIDE_NAV = { phone: 0, tablet: 96, desktop: 210 } as const;
