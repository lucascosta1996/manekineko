"use client";

/** Imported only by the isolated visual-test application, never a production route. */
import { ConfirmProvider } from "@manekineko/ui/confirm";
import { LaunchLogin } from "../components/launch/launch-login";
import { LaunchConsole } from "../components/launch/launch-console";
import { LaunchDashboard } from "../components/dashboard/launch-dashboard";
import { NetworkSettings } from "../components/dashboard/network-settings";
import { AutomationConsole } from "../components/automations/automation-console";
import { CreatorEarnings } from "../components/earnings/creator-earnings";
import { CollectionOperations } from "../components/operations/collection-operations";
import LaunchError from "../app/error";
import NotFound from "../app/not-found";
import Loading from "../app/loading";

export const launchVisualRoutes = ["/login", "/dashboard", "/activity", "/settings", "/seasons", "/launch", "/active-collection", "/upcoming-collection", "/earnings"] as const;
export function LaunchVisualFixture({ path }: { path: string }) {
  const props = { username: "visual.operator", initialChainId: "11155111" as const };
  let page;
  switch (path) {
    case "/not-found": page = <NotFound />; break;
    case "/loading": page = <Loading />; break;
    case "/login": page = <LaunchLogin />; break;
    case "/error": page = <LaunchError error={new Error("Fixture failure")} retry={() => window.location.reload()} />; break;
    case "/activity": page = <LaunchDashboard {...props} activity />; break;
    case "/settings": page = <NetworkSettings {...props} allowedChainId="11155111" />; break;
    case "/launch": page = <LaunchConsole username={props.username} allowedChainId="11155111" initialNetwork="11155111" />; break;
    case "/automations":
    case "/seasons": page = <AutomationConsole username={props.username} allowedChainId="11155111" initialNetwork="11155111" />; break;
    case "/active-collection": page = <CollectionOperations {...props} view="active" />; break;
    case "/upcoming-collection": page = <CollectionOperations {...props} view="upcoming" />; break;
    case "/earnings": page = <CreatorEarnings {...props} />; break;
    default: page = <LaunchDashboard {...props} />;
  }
  return <ConfirmProvider>{page}<footer className="dashboard-footer">Tincta · Private operator workspace</footer></ConfirmProvider>;
}
