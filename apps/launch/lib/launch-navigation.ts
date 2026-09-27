/** Only explicit internal launch destinations are eligible after login. */
export function safeLaunchDestination(value: unknown): "/seasons" | "/launch" | "/earnings" | "/active-collection" | "/upcoming-collection" {
  if (value === "/active-collection" || value === "/upcoming-collection") return value;
  if (value === "/earnings") return "/earnings";
  return value === "/launch" ? "/launch" : "/seasons";
}
