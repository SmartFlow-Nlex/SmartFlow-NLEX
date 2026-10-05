import {
  AlertTriangle,
  Brain,
  Car,
  ClipboardList,
  Home,
  Leaf,
  Map,
  Smartphone,
  TrendingUp,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * The sidebar's tabs, in one place.
 *
 * Moved out of app/dashboard/layout.tsx unchanged (labels, hrefs, icons,
 * groups) so the shell's breadcrumb and every page header's group eyebrow read
 * the same list the sidebar does. Role filtering still happens in the layout
 * through lib/auth-access.ts; nothing here decides access.
 *
 * The sidebar is the product's spine, so it is grouped by what the user is
 * trying to do rather than listed flat. Admin utilities sit in their own group
 * and are rendered pinned to the bottom, away from the daily-use links.
 */
export type NavTab = { label: string; href: string; icon: LucideIcon; group: NavGroup };
export type NavGroup = "Analytics" | "Operations" | "Planning" | "Admin";

export const NAV_TABS: NavTab[] = [
  { label: "Overview", href: "/dashboard", icon: Home, group: "Analytics" },
  { label: "Traffic", href: "/dashboard/traffic", icon: TrendingUp, group: "Analytics" },
  { label: "Incidents", href: "/dashboard/incident", icon: AlertTriangle, group: "Analytics" },
  { label: "Emissions", href: "/dashboard/sustainability", icon: Leaf, group: "Analytics" },

  { label: "Live Map", href: "/dashboard/map-comparison", icon: Map, group: "Operations" },
  { label: "Maintenance", href: "/dashboard/maintenance", icon: Wrench, group: "Operations" },
  { label: "Mobile App", href: "/dashboard/mobile", icon: Smartphone, group: "Operations" },

  { label: "Scenario Sandbox", href: "/dashboard/scenario-sandbox", icon: Car, group: "Planning" },

  { label: "Data Management", href: "/dashboard/data-management", icon: Brain, group: "Admin" },
  { label: "Audit Log", href: "/dashboard/audit-log", icon: ClipboardList, group: "Admin" },
];

/** Daily-use groups, in order. "Admin" is deliberately excluded — it renders last. */
export const NAV_GROUPS = ["Analytics", "Operations", "Planning"] as const;

/**
 * The tab a path belongs to: an exact match, else the deepest tab whose href
 * is a parent of the path (so /dashboard/incident/hourly reads as Incidents).
 * The legacy /dashboard/ai-sandbox reads as the Scenario Sandbox it redirects to.
 */
export function navEntryFor(pathname: string): NavTab | null {
  const path = pathname === "/dashboard/ai-sandbox" ? "/dashboard/scenario-sandbox" : pathname;
  const exact = NAV_TABS.find((t) => t.href === path);
  if (exact) return exact;
  const parents = NAV_TABS.filter((t) => t.href !== "/dashboard" && path.startsWith(t.href + "/"));
  parents.sort((a, b) => b.href.length - a.href.length);
  return parents[0] ?? (path.startsWith("/dashboard") ? NAV_TABS[0] : null);
}

/** The analytics accent a path carries, if any (sets --page-accent on the shell). */
export function accentFor(pathname: string): "traffic" | "incident" | "emissions" | undefined {
  if (pathname.startsWith("/dashboard/traffic")) return "traffic";
  if (pathname.startsWith("/dashboard/incident")) return "incident";
  if (pathname.startsWith("/dashboard/sustainability")) return "emissions";
  return undefined;
}
