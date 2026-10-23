import { OperatorShell } from '../components/operator-shell';
export default function Loading() { return <OperatorShell><section className="operator-boundary" aria-busy="true"><h1>Opening season control…</h1><p role="status">Loading the network and collection catalog.</p></section></OperatorShell>; }
