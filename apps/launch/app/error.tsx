'use client';
import { Button } from '@manekineko/ui/button';
import { OperatorShell } from '../components/operator-shell';
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) { return <OperatorShell authenticated={false}><section className="operator-boundary"><h1>Launch is unavailable.</h1><p role="alert">The workspace could not be loaded. Please try again.</p><Button variant="secondary" onClick={retry}>Try again</Button></section></OperatorShell>; }
