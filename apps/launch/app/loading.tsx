import { OperatorShell } from '../components/operator-shell';
export default function Loading() { return <OperatorShell authenticated={false}><section className="operator-boundary" aria-busy="true"><h1>Opening Launch…</h1><p role="status">Checking access to the workspace.</p></section></OperatorShell>; }
