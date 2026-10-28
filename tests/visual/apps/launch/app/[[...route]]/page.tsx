import { LaunchVisualFixture } from '../../../../../../apps/launch/test/visual-fixtures';
export default async function Page({ params, searchParams }: { params: Promise<{ route?: string[] }>; searchParams: Promise<{ state?: string; chainId?: string; next?: string }> }) {
 const { route = [] } = await params; const { state, chainId, next } = await searchParams;
 return <LaunchVisualFixture path={`/${route.join('/')}`} state={state} destination={next} chainId={chainId === '1' ? 1 : 11155111} />;
}
