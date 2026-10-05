"use client";

import { usePathname } from "next/navigation";
import { navEntryFor } from "../../lib/nav";

/** The sidebar group the current page sits in ("Analytics", "Operations"…),
 *  for the page header's eyebrow. A client island so PageHeader itself stays
 *  renderable from server components. */
export default function PageGroupName() {
  const pathname = usePathname() || "";
  return <>{navEntryFor(pathname)?.group ?? "SmartFlow"}</>;
}
