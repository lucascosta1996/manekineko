# Tincta UI

Shared, framework-independent React presentation for Web, Landing and Launch. Import the global `@manekineko/ui/styles.css` once from each root layout, after existing styles. App `compact.css` files contain layout-specific adaptations. Tokens cover 3 px control corners, body/control/heading scale and spacing. Coarse-pointer controls have a 44 px minimum height; focus remains visible.

- `icons`: Lucide React, 18 px and 1.6 stroke by default. Use `Icon` with a semantic name. Decorative icons are hidden from assistive technology; put accessible names on icon-only buttons. Keep brand artwork and mathematical text unchanged.
- `select`: Radix Select. Existing option declarations and string values are accepted, with an `onChange({target:{value}})` value adapter. This is not a synthetic DOM event. The visible control is a listbox, with portaled positioning, scrolling, typeahead, disabled items, Escape and focus restoration. Radix retains a hidden form control; empty values stay empty for required validation. Label using a containing label, `htmlFor`/`id`, or `aria-label`.
- `dialog`: shared Radix Dialog exports used for the support placeholder and Launch mobile drawer. Modal focus is contained and restored on dismissal.
- `links` / `footer`: configured destinations only. Web app/docs and Landing website use their own relative paths. Cross-app links and contact/Telegram/X use environment configuration; missing values are visibly unavailable. Support is a coming-soon panel with no submission backend.

WalletConnect AppKit uses its supported light/black theme, common font and 1 px master radius (SDK tokens multiply this into several radii). Its shadow UI, vendor wallet logos and icon set cannot be replaced by the app's CSS or Lucide wrapper through the public theme API. External wallet screens are also outside this system. Do not claim every SDK control has exactly 3 px corners.

References: [Radix Select](https://www.radix-ui.com/primitives/docs/components/select), [Lucide React](https://lucide.dev/guide/react). Dependencies are pinned in this package and the workspace lockfile.
