import { LaunchVisualFixture } from "../../../../../../apps/launch/test/visual-fixtures";
export default async function Page({ params }: { params: Promise<{ route?: string[] }> }) {
 const { route = [] } = await params;
 return <LaunchVisualFixture path={`/${route.join('/')}`} />;
}
