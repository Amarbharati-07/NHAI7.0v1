import type { TollPlaza } from "./adminData";

/** All plazas for assignment UIs — same list as Toll Plaza Management (no status filter). */
export function sortPlazasByName(plazas: TollPlaza[]): TollPlaza[] {
  return [...plazas].sort((a, b) => a.name.localeCompare(b.name));
}

export function filterPlazasBySearch(plazas: TollPlaza[], query: string): TollPlaza[] {
  const q = query.trim().toLowerCase();
  if (!q) return plazas;
  return plazas.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.route.toLowerCase().includes(q) ||
      p.location.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q),
  );
}

export function plazaStatusLabel(status: TollPlaza["status"]): string {
  if (status === "active") return "Active";
  if (status === "maintenance") return "Maintenance";
  return "Inactive";
}
