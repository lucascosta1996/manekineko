import { redirect } from "next/navigation";

/** Saved automation APIs and manifests remain compatible; seasons is the public workspace. */
export default function AutomationsPage() { redirect("/seasons"); }
