// VS Code codicon uslubidagi chiziqli ikonkalar (16px, currentColor) — emoji/unicode belgilar o'rniga.
const PATHS = {
  files: "M14.5 3H9.4L8 1.6 7.6 1.5H2.5l-.5.5v12l.5.5h12l.5-.5V3.5zM14 14H3V2.5h4.4L8.8 4H14z M5 7h7 M5 9.5h7 M5 12h4",
  search: "M10.5 10.5 14 14 M6.75 11.5a4.75 4.75 0 1 0 0-9.5 4.75 4.75 0 0 0 0 9.5z",
  add: "M8 2.5v11 M2.5 8h11",
  chevronDown: "M4 6l4 4 4-4",
  split: "M2.5 2.5h11v11h-11z M8 2.5v11",
  clear: "M3 4.5h10 M3 8h7 M3 11.5h5 M11 10l3 3 M14 10l-3 3",
  trash: "M3 4h10 M6 4V2.5h4V4 M4.5 4l.6 9.5h5.8l.6-9.5 M7 6.5v5 M9 6.5v5",
  close: "M4 4l8 8 M12 4l-8 8",
  newFile: "M9.5 1.5h-6v13h9v-10z M9.5 1.5v3h3 M8 8v4 M6 10h4",
  newFolder: "M1.5 3.5h5l1.5 1.5h6.5v8.5h-13z M8 7.5v4 M6 9.5h4",
  collapse: "M3.5 3.5h9v9h-9z M5.5 8h5",
  refresh: "M13 8a5 5 0 1 1-1.5-3.6 M13 2.5v2.5h-2.5",
} as const;

export type CodiconName = keyof typeof PATHS;

export function Codicon({ name, size = 16 }: { name: CodiconName; size?: number }) {
  return (
    <svg className="codicon" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.1} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
