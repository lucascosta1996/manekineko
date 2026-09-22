/** Only explicit internal launch destinations are eligible after login. */
export function safeLaunchDestination(value: unknown): "/seasons" | "/launch" {
  return value === "/launch" ? "/launch" : "/seasons";
}
