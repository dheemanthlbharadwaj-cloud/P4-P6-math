/** ASSUMPTION (open question #10): default PSLE date = 1 Oct, editable. Once this year's date has been reached
 *  (PSLE is over), the next one is next year's. */
export function defaultPsleDate(now = new Date()): string {
  const passed = now.getMonth() >= 9; // on or after 1 Oct
  return `${now.getFullYear() + (passed ? 1 : 0)}-10-01`;
}
