/** TabMerge mark: two tab shapes merging into one. Original artwork. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="30" height="30" rx="8" fill="var(--accent)" />
      <path d="M7 10h7l2 3h9v3H7z" fill="#fff" opacity="0.55" />
      <path d="M7 17h18v6a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" fill="#fff" />
      <path d="M16 13v4" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
