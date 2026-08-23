/**
 * Marketplace Deals setup, launched from the Template Library card inside the
 * existing assistant/build-list surface. Three steps: describe → review → active.
 *
 * Truthfulness rule: no marketplace adapter is wired yet, so the success state
 * says the search is saved and queued, never that we are polling Facebook.
 */
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft, CheckCircle2, List, Loader2, MapPin, Pencil, Plus, Radar, Send, Sparkles, X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspaceId } from "@/hooks/use-workspace";
import {
  CATEGORY_ATTRIBUTES, EMPTY_CRITERIA, MARKETPLACE_CATEGORIES, MARKETPLACE_SOURCES,
  RADIUS_OPTIONS, anySourceLive, categoryLabel, criteriaSummary, radiusLabel, sourceLabel,
  sourcesForCategory, suggestSearchName,
  type MarketplaceCategory, type MarketplaceCriteria,
} from "@/lib/marketplace/catalog.shared";
import {
  createMarketplaceSearch, listMarketplaceSearches, parseMarketplaceRequest,
  updateMarketplaceSearch,
} from "@/lib/marketplace/marketplace.functions";
import {
  MarketplaceSearchList, MarketplaceSearchResults,
} from "@/components/app/marketplace/marketplace-searches";
import type { MarketplaceSearchRow } from "@/lib/marketplace/searches.server";

const EXAMPLE =
  "Find Toyota Camrys and Honda Accords from 2015–2021 within 75 miles, under 130k miles, clean title, private sellers only, under $8,000.";

type Mode = "manage" | "describe" | "review" | "active" | "results";

export function MarketplaceSetup({ initialMode = "manage" }: { initialMode?: "manage" | "describe" }) {
  const { workspaceId } = useWorkspaceId();
  const parse = useServerFn(parseMarketplaceRequest);
  const create = useServerFn(createMarketplaceSearch);
  const update = useServerFn(updateMarketplaceSearch);
  const listSearches = useServerFn(listMarketplaceSearches);

  const [mode, setMode] = useState<Mode>(initialMode);
  const [prompt, setPrompt] = useState("");
  const [category, setCategory] = useState<MarketplaceCategory | null>(null);
  const [criteria, setCriteria] = useState<MarketplaceCriteria>(EMPTY_CRITERIA);
  const [location, setLocation] = useState("");
  const [radius, setRadius] = useState<number | null>(50);
  const [sources, setSources] = useState<string[]>(MARKETPLACE_SOURCES.map((s) => s.key));
  const [name, setName] = useState("");
  const [alertThreshold, setAlertThreshold] = useState(1);
  const [notifyInApp, setNotifyInApp] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const [saved, setSaved] = useState<MarketplaceSearchRow | null>(null);
  /** Set while editing an existing search — the row is patched, never recreated. */
  const [editing, setEditing] = useState<MarketplaceSearchRow | null>(null);
  const [selected, setSelected] = useState<MarketplaceSearchRow | null>(null);

  const existing = useQuery({
    queryKey: ["marketplace-searches", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => listSearches({ data: { workspaceId: workspaceId! } }),
  });

  const effectiveCategory: MarketplaceCategory = category ?? "other";
  const available = useMemo(() => sourcesForCategory(effectiveCategory), [effectiveCategory]);

  useEffect(() => {
    // Drop sources the chosen category can't serve.
    setSources((prev) => prev.filter((k) => available.some((s) => s.key === k)));
  }, [available]);

  function resetForm() {
    setEditing(null);
    setSaved(null);
    setPrompt("");
    setCriteria(EMPTY_CRITERIA);
    setCategory(null);
    setName("");
    setLocation("");
    setRadius(50);
    setSources(MARKETPLACE_SOURCES.map((s) => s.key));
    setAlertThreshold(1);
    setNotifyInApp(true);
    setNotifyEmail(false);
    setDegraded(false);
  }

  function startCreate() {
    resetForm();
    setMode("describe");
  }

  function startEdit(row: MarketplaceSearchRow) {
    setEditing(row);
    setSaved(null);
    setDegraded(false);
    setName(row.name);
    setPrompt(row.prompt);
    setCategory(row.category as MarketplaceCategory);
    setCriteria(row.criteria);
    setLocation(row.location ?? "");
    setRadius(row.radiusMiles);
    setSources(row.sources);
    setAlertThreshold(row.alertThreshold);
    setNotifyInApp(row.notifyInApp);
    setNotifyEmail(row.notifyEmail);
    setMode("review");
  }

  async function handleInterpret() {
    if (prompt.trim().length < 3) {
      toast.error("Describe what you're looking for first.");
      return;
    }
    setBusy(true);
    try {
      const res = await parse({ data: { prompt: prompt.trim(), category } });
      setCategory(res.category);
      setCriteria(res.criteria);
      setDegraded(res.degraded);
      if (res.location) setLocation(res.location);
      if (res.radiusMiles !== null) setRadius(res.radiusMiles);
      if (!editing) setName(suggestSearchName(res.category, res.criteria));
      setMode("review");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not interpret that request.");
    } finally {
      setBusy(false);
    }
  }

  async function handleStart() {
    if (!workspaceId) {
      toast.error("Pick a workspace first.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: name.trim() || suggestSearchName(effectiveCategory, criteria),
        category: effectiveCategory,
        prompt: prompt.trim(),
        criteria,
        sources,
        location: location.trim() || null,
        radiusMiles: radius,
        alertThreshold,
        notifyInApp,
        notifyEmail,
      };
      if (editing) {
        const row = await update({ data: { id: editing.id, workspaceId, ...payload } });
        toast.success("Marketplace Search Updated");
        await existing.refetch();
        setSelected(row);
        setEditing(null);
        setMode("manage");
      } else {
        const row = await create({ data: { workspaceId, ...payload } });
        setSaved(row);
        setMode("active");
        void existing.refetch();
      }
    } catch (e) {
      // Persistence failed — stay on Review, no success state.
      toast.error(e instanceof Error ? e.message : "Could not save this search.");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "results" && selected) {
    return (
      <div>
        <PageHeader title={selected.name} description="Matches for this Marketplace Search." />
        <MarketplaceSearchResults
          row={selected}
          onBack={() => setMode("manage")}
          onEdit={() => startEdit(selected)}
        />
      </div>
    );
  }

  if (mode === "active" && saved) {
    return (
      <ActiveState
        search={saved}
        onAnother={startCreate}
        onManage={() => {
          setSaved(null);
          setMode("manage");
        }}
      />
    );
  }

  if (mode === "manage") {
    const rows = existing.data?.searches ?? [];
    return (
      <div>
        <PageHeader
          title="Marketplace Searches"
          description="Saved searches LeadTrace monitors for new listings that match your criteria."
          actions={
            rows.length ? (
              <Button onClick={startCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Create Marketplace Search
              </Button>
            ) : undefined
          }
        />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <MarketplaceSearchList
            rows={rows}
            loading={existing.isLoading}
            workspaceId={workspaceId ?? null}
            onCreate={startCreate}
            onEdit={startEdit}
            onViewResults={(row) => {
              setSelected(row);
              setMode("results");
            }}
            onChanged={() => void existing.refetch()}
          />
          <div className="space-y-4">
            <IntegrationNotice />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={
          mode === "review"
            ? editing
              ? "Edit Marketplace Search"
              : "Review Your Search"
            : "What Are You Looking For?"
        }
        description={
          mode === "review"
            ? "Check the criteria LeadTrace pulled from your request. Edit anything before you start monitoring."
            : "Describe what you want and LeadTrace will turn it into a search you can monitor across available marketplaces."
        }
        actions={
          <Button variant="outline" onClick={() => setMode("manage")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Marketplace Searches
          </Button>
        }
      />

      {mode === "describe" && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-4">
            <Card>
              <CardContent className="space-y-3 p-4">
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={EXAMPLE}
                  rows={4}
                  className="resize-none"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={handleInterpret} disabled={busy}>
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    Interpret My Request
                  </Button>
                  <button
                    type="button"
                    onClick={() => setPrompt(EXAMPLE)}
                    className="text-sm text-muted-foreground underline-offset-2 hover:underline"
                  >
                    Use The Example
                  </button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3 p-4">
                <p className="text-sm font-medium text-foreground">What Type Of Item Are You Looking For?</p>
                <div className="flex flex-wrap gap-2">
                  {MARKETPLACE_CATEGORIES.map((c) => (
                    <Pill key={c.key} active={category === c.key} onClick={() => setCategory(c.key)}>
                      {c.label}
                    </Pill>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Optional — LeadTrace picks a category from your description when you leave this blank.
                </p>
              </CardContent>
            </Card>

            <SourcePicker
              available={available}
              sources={sources}
              setSources={setSources}
            />

            <Card>
              <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-foreground">Location</span>
                  <Input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="City, State Or ZIP"
                  />
                </label>
                <div className="space-y-1.5">
                  <span className="text-sm font-medium text-foreground">Radius</span>
                  <div className="flex flex-wrap gap-1.5">
                    {RADIUS_OPTIONS.map((r) => (
                      <Pill key={r.label} active={radius === r.value} onClick={() => setRadius(r.value)}>
                        {r.label}
                      </Pill>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <IntegrationNotice />
            <ExistingSearches rows={existing.data?.searches ?? []} onManage={() => setMode("manage")} />
          </div>
        </div>
      )}

      {mode === "review" && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-4">
            {degraded && (
              <div className="rounded-lg border border-dashed border-border bg-surface-muted px-4 py-3 text-sm text-muted-foreground">
                The AI parser was unavailable, so only the basics were pulled from your text. Fill in
                the criteria below before you start monitoring.
              </div>
            )}
            <Card>
              <CardContent className="space-y-3 p-4">
                <label className="space-y-1.5 block">
                  <span className="text-sm font-medium text-foreground">Search Name</span>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label className="space-y-1.5 block">
                  <span className="text-sm font-medium text-foreground">Your Request</span>
                  <Textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={3}
                    className="resize-none"
                    placeholder={EXAMPLE}
                  />
                </label>
                {editing && (
                  <Button variant="outline" size="sm" onClick={handleInterpret} disabled={busy}>
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    Re-Interpret My Request
                  </Button>
                )}
              </CardContent>
            </Card>

            <CriteriaEditor
              category={effectiveCategory}
              setCategory={setCategory}
              criteria={criteria}
              setCriteria={setCriteria}
              location={location}
              setLocation={setLocation}
              radius={radius}
              setRadius={setRadius}
            />

            <SourcePicker available={available} sources={sources} setSources={setSources} />

            <AlertSettings
              alertThreshold={alertThreshold}
              setAlertThreshold={setAlertThreshold}
              notifyInApp={notifyInApp}
              setNotifyInApp={setNotifyInApp}
              notifyEmail={notifyEmail}
              setNotifyEmail={setNotifyEmail}
            />

            <Card>
              <CardContent className="space-y-3 p-4">
                <p className="text-sm font-medium text-foreground">Summary</p>
                <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {criteriaSummary(effectiveCategory, criteria, location.trim() || null, radius, sources).map((row) => (
                    <div key={row.label} className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-1.5">
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{row.label}</dt>
                      <dd className="text-right text-sm font-medium text-foreground">{row.values.join(", ")}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleStart} disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Radar className="mr-2 h-4 w-4" />}
                {editing ? "Save Changes" : "Start Monitoring"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setMode(editing ? "manage" : "describe")}
                disabled={busy}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                {editing ? "Cancel" : "Back"}
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <IntegrationNotice />
          </div>
        </div>
      )}
    </div>
  );
}

/** Alert threshold + notification preferences, editable at create and edit time. */
function AlertSettings({
  alertThreshold, setAlertThreshold, notifyInApp, setNotifyInApp, notifyEmail, setNotifyEmail,
}: {
  alertThreshold: number;
  setAlertThreshold: (n: number) => void;
  notifyInApp: boolean;
  setNotifyInApp: (v: boolean) => void;
  notifyEmail: boolean;
  setNotifyEmail: (v: boolean) => void;
}) {
  return (
    <Card>
      <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Alert Threshold</span>
          <Input
            inputMode="numeric"
            value={alertThreshold}
            onChange={(e) => {
              const n = Number(e.target.value.replace(/[^0-9]/g, ""));
              setAlertThreshold(Math.min(100, Math.max(1, n || 1)));
            }}
          />
          <span className="block text-xs text-muted-foreground">
            Alert Me After This Many New Matches.
          </span>
        </label>
        <div className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Notify Me By</span>
          <div className="flex flex-wrap gap-1.5">
            <Pill active={notifyInApp} onClick={() => setNotifyInApp(!notifyInApp)}>In-App</Pill>
            <Pill active={notifyEmail} onClick={() => setNotifyEmail(!notifyEmail)}>Email</Pill>
          </div>
          {!notifyInApp && !notifyEmail && (
            <span className="block text-xs text-muted-foreground">
              Notifications Off — Matches Still Collect Silently.
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}


function Pill({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-surface text-foreground hover:bg-surface-muted"
      }`}
    >
      {children}
    </button>
  );
}

function SourcePicker({
  available, sources, setSources,
}: {
  available: ReturnType<typeof sourcesForCategory>;
  sources: string[];
  setSources: (fn: (prev: string[]) => string[]) => void;
}) {
  const allOn = available.length > 0 && available.every((s) => sources.includes(s.key));
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-foreground">Where Should We Look?</p>
          <Pill active={allOn} onClick={() => setSources(() => (allOn ? [] : available.map((s) => s.key)))}>
            All Available Sources
          </Pill>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {available.map((s) => {
            const on = sources.includes(s.key);
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSources((prev) => (on ? prev.filter((k) => k !== s.key) : [...prev, s.key]))}
                className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition ${
                  on ? "border-primary bg-primary/5" : "border-border bg-surface hover:bg-surface-muted"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">{s.label}</span>
                  <span className="block text-xs text-muted-foreground">{s.region}</span>
                </span>
                <Badge variant={s.status === "live" ? "default" : "secondary"}>
                  {s.status === "live" ? "Live" : "Not Connected"}
                </Badge>
              </button>
            );
          })}
        </div>
        {!anySourceLive() && (
          <p className="text-xs text-muted-foreground">
            No marketplace connection is live yet. Your selection is saved with the search and starts
            collecting as soon as a source is connected.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function IntegrationNotice() {
  return (
    <Card className="border-dashed">
      <CardContent className="space-y-2 p-4">
        <p className="text-sm font-medium text-foreground">Integration Status</p>
        <p className="text-sm text-muted-foreground">
          Marketplace Deals is in its first phase: LeadTrace saves and validates your search now.
          Facebook Marketplace, Craigslist, OfferUp, Kijiji and Gumtree collection are not connected
          yet, so nothing is being polled on your behalf.
        </p>
      </CardContent>
    </Card>
  );
}

function ExistingSearches({ rows, onManage }: { rows: MarketplaceSearchRow[]; onManage: () => void }) {
  if (!rows.length) return null;
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <p className="text-sm font-medium text-foreground">Your Marketplace Searches</p>
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-lg border border-border px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-foreground">{r.name}</span>
                <Badge variant="secondary" className="capitalize">{r.status}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {categoryLabel(r.category)} · {r.sources.length ? r.sources.map(sourceLabel).join(", ") : "No sources"}
              </p>
            </li>
          ))}
        </ul>
        <Button variant="ghost" size="sm" onClick={onManage}>
          <List className="mr-2 h-4 w-4" />
          Manage All Searches
        </Button>
      </CardContent>
    </Card>
  );
}

function ActiveState({
  search, onAnother, onManage,
}: { search: MarketplaceSearchRow; onAnother: () => void; onManage: () => void }) {
  const rows = criteriaSummary(
    search.category as MarketplaceCategory,
    search.criteria,
    search.location,
    search.radiusMiles,
    search.sources,
  );
  return (
    <div>
      <PageHeader
        title="Marketplace Search Active"
        description="Your search is saved to this workspace. Here's exactly what LeadTrace will watch for."
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-foreground">{search.name}</p>
                <p className="text-sm text-muted-foreground">
                  {categoryLabel(search.category)} ·{" "}
                  {search.location ? `${search.location} · ` : ""}
                  {radiusLabel(search.radiusMiles)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {search.sources.length ? (
                search.sources.map((s) => (
                  <Badge key={s} variant="secondary">{sourceLabel(s)}</Badge>
                ))
              ) : (
                <Badge variant="secondary">No Sources Selected</Badge>
              )}
            </div>

            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {rows.map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-1.5">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{row.label}</dt>
                  <dd className="text-right text-sm font-medium text-foreground">{row.values.join(", ")}</dd>
                </div>
              ))}
            </dl>

            <div className="grid gap-2 sm:grid-cols-3">
              <Stat label="Status" value={anySourceLive() ? "Monitoring" : "Saved — Awaiting Source"} />
              <Stat label="Last Checked" value={search.lastCheckedAt ? new Date(search.lastCheckedAt).toLocaleString() : "Never"} />
              <Stat label="Next Check" value={search.nextCheckAt ? new Date(search.nextCheckAt).toLocaleString() : "Not Scheduled"} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={onManage}>
                <List className="mr-2 h-4 w-4" />
                All Marketplace Searches
              </Button>
              <Button asChild variant="ghost">
                <Link to="/app/templates">Back To Template Library</Link>
              </Button>
              <Button variant="ghost" onClick={onAnother}>
                <Send className="mr-2 h-4 w-4" />
                Create Another Search
              </Button>
            </div>
          </CardContent>
        </Card>
        <IntegrationNotice />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

/** Editable structured criteria — every value can be corrected before activation. */
function CriteriaEditor({
  category, setCategory, criteria, setCriteria, location, setLocation, radius, setRadius,
}: {
  category: MarketplaceCategory;
  setCategory: (c: MarketplaceCategory) => void;
  criteria: MarketplaceCriteria;
  setCriteria: (c: MarketplaceCriteria) => void;
  location: string;
  setLocation: (v: string) => void;
  radius: number | null;
  setRadius: (v: number | null) => void;
}) {
  const attrs = CATEGORY_ATTRIBUTES[category] ?? [];
  const extra = Object.keys(criteria.attributes).filter((k) => !attrs.some((a) => a.key === k));

  function setAttr(key: string, value: string) {
    const next = { ...criteria.attributes };
    if (!value.trim()) delete next[key];
    else next[key] = value;
    setCriteria({ ...criteria, attributes: next });
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Category</p>
          <div className="flex flex-wrap gap-1.5">
            {MARKETPLACE_CATEGORIES.map((c) => (
              <Pill key={c.key} active={category === c.key} onClick={() => setCategory(c.key)}>
                {c.label}
              </Pill>
            ))}
          </div>
        </div>

        <ListField
          label="Looking For"
          values={criteria.targets}
          onChange={(v) => setCriteria({ ...criteria, targets: v })}
          placeholder="Add An Item, E.g. Toyota Camry"
        />

        <div className="grid gap-3 sm:grid-cols-2">
          {attrs.map((a) => (
            <label key={a.key} className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">{a.label}</span>
              <Input
                value={String(criteria.attributes[a.key] ?? "")}
                onChange={(e) => setAttr(a.key, e.target.value)}
                placeholder="Any"
              />
            </label>
          ))}
          {extra.map((k) => (
            <label key={k} className="space-y-1.5">
              <span className="text-sm font-medium text-foreground capitalize">{k.replace(/_/g, " ")}</span>
              <Input value={String(criteria.attributes[k] ?? "")} onChange={(e) => setAttr(k, e.target.value)} />
            </label>
          ))}
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">Min Price</span>
            <Input
              inputMode="numeric"
              value={criteria.priceMin ?? ""}
              onChange={(e) =>
                setCriteria({ ...criteria, priceMin: e.target.value ? Number(e.target.value.replace(/[^0-9]/g, "")) : null })
              }
              placeholder="Any"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">Max Price</span>
            <Input
              inputMode="numeric"
              value={criteria.priceMax ?? ""}
              onChange={(e) =>
                setCriteria({ ...criteria, priceMax: e.target.value ? Number(e.target.value.replace(/[^0-9]/g, "")) : null })
              }
              placeholder="Any"
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <MapPin className="h-3.5 w-3.5" /> Location
            </span>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, State Or ZIP" />
          </label>
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">Radius</span>
            <div className="flex flex-wrap gap-1.5">
              {RADIUS_OPTIONS.map((r) => (
                <Pill key={r.label} active={radius === r.value} onClick={() => setRadius(r.value)}>
                  {r.label}
                </Pill>
              ))}
            </div>
          </div>
        </div>

        <ListField
          label="Keywords"
          values={criteria.keywords}
          onChange={(v) => setCriteria({ ...criteria, keywords: v })}
          placeholder="Add A Keyword"
        />
        <ListField
          label="Excluded"
          values={criteria.exclusions}
          onChange={(v) => setCriteria({ ...criteria, exclusions: v })}
          placeholder="Add An Exclusion, E.g. Salvage"
        />
      </CardContent>
    </Card>
  );
}

function ListField({
  label, values, onChange, placeholder,
}: { label: string; values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  function add() {
    const v = draft.trim();
    if (!v) return;
    if (!values.includes(v)) onChange([...values, v]);
    setDraft("");
  }
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <Pencil className="h-3.5 w-3.5" /> {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-muted px-2.5 py-1 text-sm text-foreground"
          >
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`}>
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
        />
        <Button type="button" variant="outline" onClick={add}>Add</Button>
      </div>
    </div>
  );
}
