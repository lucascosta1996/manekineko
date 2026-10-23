import { LinkButton } from '@manekineko/ui/button';
import { OperatorShell } from '../components/operator-shell';
export default function NotFound() { return <OperatorShell><section className="operator-boundary"><h1>Page not found.</h1><p>Manage pending signatures and follow season progress from the dashboard.</p><LinkButton href="/dashboard">Open season control</LinkButton></section></OperatorShell>; }
