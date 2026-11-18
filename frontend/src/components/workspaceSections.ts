import type { WorkspaceIconName } from "./WorkspaceUI";

type Section = { id: string; label: string; icon: WorkspaceIconName };
export const workspaceSections = {
  farmer: [
    { label: "Farm", items: [
      { id: "overview", label: "Overview", icon: "overview" },
      { id: "inventory", label: "Inventory", icon: "inventory" },
      { id: "orders", label: "Orders", icon: "orders" },
    ] },
    { label: "Delivery", items: [
      { id: "plan", label: "Route planning", icon: "route" },
      { id: "saved", label: "Saved routes", icon: "saved" },
    ] },
    { label: "Manage", items: [
      { id: "analytics", label: "Analytics", icon: "analytics" },
      { id: "settings", label: "Settings", icon: "account" },
    ] },
  ],
  restaurant: [
    { label: "Sourcing", items: [
      { id: "market", label: "Source produce", icon: "market" },
      { id: "analytics", label: "Sourcing insights", icon: "analytics" },
    ] },
    { label: "Delivery", items: [
      { id: "plan", label: "Route planning", icon: "route" },
      { id: "saved", label: "Saved routes", icon: "saved" },
    ] },
    { label: "Manage", items: [{ id: "settings", label: "Settings", icon: "account" }] },
  ],
} as const satisfies Record<string, readonly { label: string; items: readonly Section[] }[]>;

export type WorkspaceRole = keyof typeof workspaceSections;
export type WorkspacePage = (typeof workspaceSections)[WorkspaceRole][number]["items"][number]["id"];
