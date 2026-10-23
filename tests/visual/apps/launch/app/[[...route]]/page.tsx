import { LaunchVisualFixture } from '../../../../../../apps/launch/test/visual-fixtures';
export default async function Page({ params, searchParams }: { params: Promise<{ route?: string[] }>; searchParams: Promise<{ state?: string; chainId?: string }> }) {
 const { route = [] } = await params; const { state, chainId } = await searchParams;
 return <LaunchVisualFixture path={`/${route.join('/')}`} state={state} chainId={chainId === '1' ? 1 : 11155111} />;
}
