import { redirect } from "next/navigation";
import { listCollections } from "../../lib/collections/repository";
import { mintDestination } from "../../lib/seasons/model";

export const dynamic = "force-dynamic";

export default async function MintEntryPage() {
  const collections = await listCollections();
  redirect(mintDestination(collections, Date.now()));
}
