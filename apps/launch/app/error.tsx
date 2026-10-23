'use client';
import { Button } from '@manekineko/ui/button';
import { OperatorShell } from '../components/operator-shell';
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) { return <OperatorShell><section className="operator-boundary"><h1>Season control is unavailable.</h1><p role="alert">The deployment configuration could not be loaded. No wallet action was requested.</p><Button variant="secondary" onClick={retry}>Try again</Button></section></OperatorShell>; }
