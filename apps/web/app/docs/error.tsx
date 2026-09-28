"use client";
import { Button } from "@manekineko/ui/button";

export default function DocsError({ retry }: { retry: () => void }) {
  return <section className="route-message"><p className="eyebrow">HOW IT WORKS</p><h1>This guide is taking a moment.</h1><p role="alert">We couldn’t open the page. Please try again.</p><Button onClick={retry}>Try again</Button></section>;
}
