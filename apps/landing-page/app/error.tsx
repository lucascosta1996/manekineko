"use client";
import { Button } from "@manekineko/ui/button";
export default function ErrorPage({ retry }: { retry: () => void }) {
 return <main className="wrap hero"><h1>Page temporarily unavailable</h1><p className="hero-description">We couldn’t load this page. Please try again.</p><Button onClick={retry}>Try again</Button></main>;
}
