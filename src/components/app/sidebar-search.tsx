import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, ChevronDown, Users, ListChecks, MessageSquare, Radio, Home } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Scope = "leads" | "lists";

const SCOPES: { value: Scope; label: string; icon: typeof Users; placeholder: string }[] = [
  { value: "leads", label: "Leads", icon: Users, placeholder: "Search Leads…" },
  { value: "lists", label: "Lists", icon: ListChecks, placeholder: "Search Lists…" },
];

const JUMP_TO = [
  { to: "/app/inbox", label: "Conversations", icon: MessageSquare },
  { to: "/app/campaigns", label: "Campaigns", icon: Radio },
  { to: "/app/property-search", label: "Property Search", icon: Home },
] as const;

/**
 * Sidebar-scoped search: the caret picks which library the query runs against
 * so one field serves the two high-volume tables, and doubles as a jump menu
 * for surfaces that don't have a searchable table of their own.
 */
export function SidebarSearch() {
  const navigate = useNavigate();
  const [scope, setScope] = useState<Scope>("leads");
  const [value, setValue] = useState("");
  const active = SCOPES.find((s) => s.value === scope)!;

  const submit = () => {
    const q = value.trim();
    navigate({
      to: scope === "leads" ? "/app/leads" : "/app/lists",
      search: q ? { q } : {},
    });
  };

  return (
    <div className="flex items-center gap-1 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-1.5 focus-within:border-sidebar-ring">
      <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        placeholder={active.placeholder}
        aria-label={`Search ${active.label}`}
        className="h-8 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
      />
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Search Options"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Search In
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup value={scope} onValueChange={(v) => setScope(v as Scope)}>
            {SCOPES.map((s) => (
              <DropdownMenuRadioItem key={s.value} value={s.value} className="gap-2">
                <s.icon className="h-3.5 w-3.5" /> {s.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Jump To
          </DropdownMenuLabel>
          {JUMP_TO.map((j) => (
            <DropdownMenuItem key={j.to} className="gap-2" onSelect={() => navigate({ to: j.to })}>
              <j.icon className="h-3.5 w-3.5" /> {j.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
