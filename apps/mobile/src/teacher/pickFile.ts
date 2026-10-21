// File picker (web only; the dashboard is a web page). Resolves the chosen files, or [] when cancelled.
export function pickFiles(_accept: string, _multiple = true): Promise<File[]> {
  return Promise.resolve([]);
}
