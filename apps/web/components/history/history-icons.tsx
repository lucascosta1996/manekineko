type IconName = "arrow" | "search" | "chevron" | "sparkle" | "trophy" | "ticket" | "copy" | "check";

export function HistoryIcon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {name === "arrow" && <><path d="M5 12h14M13 6l6 6-6 6" /></>}
      {name === "search" && <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>}
      {name === "chevron" && <path d="m8 10 4 4 4-4" />}
      {name === "sparkle" && <><path d="m12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8Z" /></>}
      {name === "ticket" && <><path d="M4 5h16v5a2 2 0 0 0 0 4v5H4v-5a2 2 0 0 0 0-4Z" /><path d="M9 5v2m0 3v1m0 3v1m0 3v1" /></>}
      {name === "trophy" && <><path d="M7 3h10v6a5 5 0 0 1-10 0ZM7 5H3v3a4 4 0 0 0 5 3M17 5h4v3a4 4 0 0 1-5 3M12 14v6M8 21h8" /></>}
      {name === "copy" && <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M15 8V4H4v11h4" /></>}
      {name === "check" && <path d="m5 12 4 4L19 6" />}
    </svg>
  );
}
