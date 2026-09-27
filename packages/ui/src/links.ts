export type PublicLinks = {
  website: string | null;
  app: string | null;
  docs: string | null;
  contact: string | null;
  telegram: string | null;
  social: string | null;
};
export function publicLinks(config: {
  website?: string;
  app?: string;
  contact?: string;
  telegram?: string;
  social?: string;
}): PublicLinks {
  const safe = (value?: string, mail = false) => {
    try {
      const url = new URL(value ?? "");
      return !url.username &&
        !url.password &&
        (url.protocol === "https:" ||
          (url.protocol === "http:" &&
            ["localhost", "127.0.0.1"].includes(url.hostname)) ||
          (mail && url.protocol === "mailto:"))
        ? url.href
        : null;
    } catch {
      return null;
    }
  };
  const app = safe(config.app);
  return {
    website: safe(config.website),
    app,
    docs: app ? new URL("/docs", app).href : null,
    contact: safe(config.contact, true),
    telegram: safe(config.telegram),
    social: safe(config.social),
  };
}
