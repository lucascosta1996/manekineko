import Link from "next/link";

export default function DocsNotFound() {
  return <section className="docs-not-found"><p className="eyebrow">DOCUMENTATION / 404</p><h1>This guide could not be found.</h1><p>Choose a topic from the navigation, or return to the introduction.</p><Link className="text-link" href="/docs">Back to reward guides →</Link></section>;
}
