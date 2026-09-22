export function LiveDataNotice({ retrying }: { retrying: boolean }) {
  return <p className="live-data-notice" role="status">{retrying
    ? "Updates are temporarily delayed. Showing the last available data and retrying automatically."
    : "Updates automatically. New blockchain activity appears after confirmation."}</p>;
}
