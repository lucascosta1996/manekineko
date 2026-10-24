"use client";

import { Button } from "@manekineko/ui/button";

export function WhitepaperPrint() {
  return <>
    <Button className="paper-print-action" variant="secondary" onClick={() => window.print()}>Print whitepaper</Button>
    <noscript><style>{".paper-print-action { display: none; }"}</style><span>Use your browser’s Print command to save a copy.</span></noscript>
  </>;
}
