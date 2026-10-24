import { WebVisualFixture } from "../../../../../../apps/web/test/visual-fixtures";
export default async function Page({ params, searchParams }: { params: Promise<{ route?: string[] }>; searchParams: Promise<{ state?: string; page?: string }> }) {
 const { route = [] } = await params; const { state, page } = await searchParams;
 return <WebVisualFixture path={`/${route.join('/')}`} state={state} page={page ? Number(page) : 1} />;
}
