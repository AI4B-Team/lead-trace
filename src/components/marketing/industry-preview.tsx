import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Database,
  Filter,
  Smartphone,
  ShieldCheck,
  ArrowRight,
  Check,
  Building2,
  Landmark,
  Sun,
  Wrench,
  Megaphone,
} from "lucide-react";

type Preview = {
  key: string;
  label: string;
  slug: string;
  icon: typeof Database;
  source: string;
  filters: string[];
  found: number;
  verified: number;
  ready: number;
  outputLabel: string;
  guarantees: string[];
};

const PREVIEWS: Preview[] = [
  {
    key: "insurance",
    label: "Insurance",
    slug: "insurance",
    icon: Building2,
    source: "Business Search + Carrier Lists",
    filters: ["Medicare Agents", "P&C Agencies", "Life Insurance", "Commercial Brokers"],
    found: 4283,
    verified: 2916,
    ready: 2431,
    outputLabel: "Agents & Agencies",
    guarantees: ["DNC Checked", "Skip Trace Available", "Ready For SMS"],
  },
  {
    key: "real_estate",
    label: "Real Estate",
    slug: "realestate",
    icon: Landmark,
    source: "County Public Records",
    filters: ["Probate Leads", "Vacant Properties", "Tax Delinquencies", "Code Violations"],
    found: 8940,
    verified: 5324,
    ready: 4712,
    outputLabel: "Property Owners",
    guarantees: ["Verified", "DNC Checked", "Ready For Outreach"],
  },
  {
    key: "solar",
    label: "Solar & Roofing",
    slug: "solar",
    icon: Sun,
    source: "Permit Data + Business Search",
    filters: ["Storm-Damaged ZIPs", "Aging Roof Permits", "Homeowner Filters", "High-Bill Areas"],
    found: 6120,
    verified: 3878,
    ready: 3245,
    outputLabel: "Homeowners",
    guarantees: ["Verified", "DNC Checked", "Quiet Hours Enforced"],
  },
  {
    key: "home_services",
    label: "Home Services",
    slug: "home-services",
    icon: Wrench,
    source: "Business Search By Trade",
    filters: ["Roofers", "Electricians", "Plumbers", "Pressure Washing"],
    found: 5242,
    verified: 3410,
    ready: 2831,
    outputLabel: "Local Businesses",
    guarantees: ["Line Type Checked", "DNC Checked", "Ready For SMS"],
  },
  {
    key: "agency",
    label: "Agencies",
    slug: "agency",
    icon: Megaphone,
    source: "Uploaded Client Lists + Search",
    filters: ["Per-Client Workspaces", "White-Label Sending", "Bulk Uploads", "Number Pools"],
    found: 12480,
    verified: 8104,
    ready: 7392,
    outputLabel: "Client Contacts",
    guarantees: ["Per-Client Isolation", "DNC Checked", "10DLC Registered"],
  },
];

function Stat({ label, value, total, accent }: { label: string; value: number; total: number; accent?: boolean }) {
  const pct = Math.round((value / total) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className={`font-display text-lg font-bold tabular-nums ${accent ? "text-primary" : "text-foreground"}`}>
          {value.toLocaleString()}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${accent ? "bg-primary" : "bg-foreground/40"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function IndustryPreview() {
  const [active, setActive] = useState(PREVIEWS[0].key);
  const p = PREVIEWS.find((x) => x.key === active)!;
  const Icon = p.icon;

  return (
    <section className="bg-surface py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Industries</div>
          <h2 className="mt-3 font-display text-4xl font-black leading-tight text-foreground md:text-5xl lg:whitespace-nowrap">
            Same Platform. Built For Your Industry.
          </h2>
        </div>

        <div className="mt-10 flex flex-wrap justify-center gap-2">
          {PREVIEWS.map((i) => (
            <button
              key={i.key}
              type="button"
              onClick={() => setActive(i.key)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                active === i.key
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border bg-surface text-foreground hover:border-primary/50"
              }`}
            >
              {i.label}
            </button>
          ))}
        </div>

        <div key={p.key} className="mt-8 overflow-hidden rounded-2xl border border-border bg-surface shadow-xl animate-in fade-in duration-300">
          <div className="flex items-center gap-3 border-b border-border bg-surface-muted px-6 py-4">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <div className="truncate font-display font-bold text-foreground">{p.label}</div>
              <div className="text-xs text-muted-foreground">Live Preview</div>
            </div>
          </div>

          <div className="grid gap-8 p-6 md:grid-cols-3 md:p-8">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Database className="h-3.5 w-3.5" /> Source
              </div>
              <div className="mt-3 rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm font-medium text-foreground">
                {p.source}
              </div>
              <div className="mt-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Filter className="h-3.5 w-3.5" /> Top Searches
              </div>
              <ul className="mt-3 space-y-2">
                {p.filters.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-foreground">
                    <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> {f}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Smartphone className="h-3.5 w-3.5" /> Pipeline
              </div>
              <div className="mt-3 space-y-4">
                <Stat label="Records Found" value={p.found} total={p.found} />
                <Stat label="Verified" value={p.verified} total={p.found} />
                <Stat label="Ready For Outreach" value={p.ready} total={p.found} accent />
              </div>
              <div className="mt-5 rounded-xl bg-primary/5 px-4 py-3">
                <div className="font-display text-2xl font-black tabular-nums text-primary">
                  {p.ready.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground">{p.outputLabel} Ready To Text</div>
              </div>
            </div>

            <div className="flex flex-col">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" /> Compliance
              </div>
              <ul className="mt-3 space-y-2">
                {p.guarantees.map((g) => (
                  <li
                    key={g}
                    className="flex items-center gap-2 rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm font-medium text-foreground"
                  >
                    <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> {g}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-6">
                <Button asChild className="w-full">
                  <Link to={`/${p.slug}` as string}>
                    View Industry Page <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link to="/industries" className="text-sm font-semibold text-primary hover:underline">
            See All Industries
          </Link>
        </div>
      </div>
    </section>
  );
}
