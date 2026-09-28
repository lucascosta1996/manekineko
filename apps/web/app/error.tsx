"use client";

import { Button } from "@manekineko/ui/button";
import { buttonClassName } from "@manekineko/ui/button-styles";
import Link from "next/link";
import { SiteShell } from "../components/site-shell";

export default function ErrorPage({ retry }: { retry: () => void }) {
  return <SiteShell><section className="route-message"><p className="eyebrow">TEMPORARILY UNAVAILABLE</p><h1>A brief pause.</h1><p role="alert">We couldn’t load this page. Please try again.</p><div className="ui-actions"><Button onClick={retry}>Try again</Button><Link href="/docs" className={buttonClassName({ variant: "secondary" })}>How it works</Link></div></section></SiteShell>;
}
