import {
  ArrowRight,
  ArrowUpRight,
  ArrowLeft,
  ArrowDown,
  ChevronDown,
  ChevronUp,
  Check,
  Copy,
  Search,
  Sparkles,
  Trophy,
  Ticket,
  Plus,
  Minus,
  X,
  Menu,
  Play,
  Pause,
  Diamond,
  LayoutDashboard,
  Layers,
  Activity,
  Wallet,
  Settings,
  RefreshCw,
  LogOut,
  Info,
  ShieldCheck,
  ExternalLink,
  type LucideProps,
} from "lucide-react";
const icons = {
  arrow: ArrowRight,
  diagonal: ArrowUpRight,
  back: ArrowLeft,
  down: ArrowDown,
  chevron: ChevronDown,
  up: ChevronUp,
  check: Check,
  copy: Copy,
  search: Search,
  sparkle: Sparkles,
  spark: Sparkles,
  trophy: Trophy,
  ticket: Ticket,
  plus: Plus,
  minus: Minus,
  close: X,
  menu: Menu,
  play: Play,
  pause: Pause,
  ethereum: Diamond,
  diamond: Diamond,
  dashboard: LayoutDashboard,
  layers: Layers,
  activity: Activity,
  wallet: Wallet,
  settings: Settings,
  refresh: RefreshCw,
  logout: LogOut,
  info: Info,
  shield: ShieldCheck,
  external: ExternalLink,
};
export type IconName = keyof typeof icons;
export function Icon({
  name = "arrow",
  className = "",
  ...props
}: Omit<LucideProps, "ref"> & { name?: IconName }) {
  const Glyph = icons[name];
  return (
    <Glyph
      width={18}
      height={18}
      strokeWidth={1.6}
      {...props}
      className={`ui-icon ${className}`}
      aria-hidden="true"
      focusable="false"
    />
  );
}
