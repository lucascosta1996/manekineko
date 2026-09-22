import type { AutomationSummary } from "./launch-automation.ts";

/** Imported seasons follow the source file; other drafts follow them, newest first. */
export function orderAutomationSummaries(items: AutomationSummary[]): AutomationSummary[] {
  return [...items].sort((a, b) =>
    (a.seasonOrder ?? Number.MAX_SAFE_INTEGER) - (b.seasonOrder ?? Number.MAX_SAFE_INTEGER)
      || b.updatedAt.localeCompare(a.updatedAt)
      || b.id.localeCompare(a.id),
  );
}
