// react-dom ships no types here; the print sheet (web only) needs just createPortal.
declare module "react-dom" {
  import type { ReactNode, ReactPortal } from "react";
  export function createPortal(children: ReactNode, container: Element): ReactPortal;
}
