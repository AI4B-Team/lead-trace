import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, ChevronsUpDown, Plus, Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  useWorkspaceId, useCreateWorkspace, useWorkspaceRole,
  renameWorkspace, deleteWorkspace,
} from "@/hooks/use-workspace";

export function WorkspaceSwitcher() {
  const { workspaceId, workspaceName, workspaces, switchWorkspace } = useWorkspaceId();
  const { create, creating } = useCreateWorkspace();
  const { canRename, canDelete } = useWorkspaceRole();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmValue, setConfirmValue] = useState("");
  const [deleting, setDeleting] = useState(false);
  const isLastWorkspace = workspaces.length <= 1;

  const onCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await create(trimmed);
      toast.success(`Switched To ${trimmed}`);
      setOpen(false);
      setName("");
      // A brand-new workspace is empty regardless of how long the account has
      // existed, so land on Build — the reason the workspace was created.
      navigate({ to: "/app/assistant" });
    } catch {
      toast.error("Could Not Create Workspace");
    }
  };

  const onRename = async () => {
    const trimmed = renameValue.trim();
    const t = target;
    if (!trimmed || !t || trimmed === t.name) {
      setRenameOpen(false);
      return;
    }
    setSavingName(true);
    try {
      await renameWorkspace(t.id, trimmed);
      toast.success("Workspace Renamed");
      setRenameOpen(false);
    } catch {
      toast.error("Could Not Rename Workspace");
    } finally {
      setSavingName(false);
    }
  };

  const onDelete = async () => {
    if (!target) return;
    setDeleting(true);
    try {
      const next = await deleteWorkspace(target.id);
      toast.success("Workspace Deleted");
      setDeleteOpen(false);
      setConfirmValue("");
      navigate({ to: next ? "/app" : "/app/assistant" });
    } catch {
      toast.error("Could Not Delete Workspace");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-full justify-center gap-1.5 border border-primary px-2 text-sm font-medium text-sidebar-foreground hover:bg-primary/10 hover:text-primary"
          >
            <span className="max-w-[180px] truncate">
              {workspaceName?.trim() || "Select Workspace"}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-80" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Workspaces
          </DropdownMenuLabel>
          {workspaces.map((w) => {
            const isActive = w.id === workspaceId;
            return (
              <DropdownMenuItem
                key={w.id}
                onSelect={() => {
                  if (isActive) return;
                  switchWorkspace(w.id);
                  // Re-resolve the landing surface for the workspace we switch into:
                  // empty ones go to Build, established ones to the Dashboard.
                  navigate({ to: "/app" });
                }}
                className="group gap-2 justify-between"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Check className={`h-3.5 w-3.5 shrink-0 ${isActive ? "opacity-100" : "opacity-0"}`} />
                  <span className="truncate">{w.name}</span>
                </div>
                {(canRename || canDelete) && (
                  <div
                    className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    {canRename && (
                      <button
                        type="button"
                        onClick={() => {
                          setTarget({ id: w.id, name: w.name });
                          setRenameValue(w.name);
                          setRenameOpen(true);
                        }}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                        aria-label="Rename workspace"
                        title="Rename workspace"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        disabled={isLastWorkspace}
                        onClick={() => {
                          setTarget({ id: w.id, name: w.name });
                          setConfirmValue("");
                          setDeleteOpen(true);
                        }}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
                        aria-label="Delete workspace"
                        title="Delete workspace"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setOpen(true)} className="gap-2">
            <Plus className="h-3.5 w-3.5" /> New Workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">New Workspace</DialogTitle>
            <DialogDescription>
              Create a separate workspace for each business, client, or market. Leads,
              campaigns, phone numbers, and settings stay organized automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="ws-name">Workspace</Label>
            <Input
              id="ws-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tampa Roofing"
              onKeyDown={(e) => { if (e.key === "Enter") void onCreate(); }}
            />
            <div className="pt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/70">Examples:</span>{" "}
              {["Tampa Roofing", "Chicago Investors", "Client: ABC Plumbing"].map((ex, i) => (
                <span key={ex}>
                  {i > 0 ? " · " : null}
                  <button
                    type="button"
                    onClick={() => setName(ex)}
                    className="cursor-pointer underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
                  >
                    {ex}
                  </button>
                </span>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => void onCreate()}
              disabled={creating || !name.trim()}
              className="min-w-[11rem] bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {creating && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Create Workspace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Rename Workspace</DialogTitle>
            <DialogDescription>
              The name is how this workspace appears to you and your team. Nothing else changes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="ws-rename">Workspace</Label>
            <Input
              id="ws-rename"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void onRename(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button
              onClick={() => void onRename()}
              disabled={savingName || !renameValue.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {savingName && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Save Name
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Delete Workspace</DialogTitle>
            <DialogDescription>
              This permanently deletes <span className="font-medium text-foreground">{target?.name}</span> and
              everything in it — leads, lists, campaigns, conversations, phone numbers, and suppression records.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="ws-confirm">
              Type <span className="font-medium text-foreground">{target?.name}</span> To Confirm
            </Label>
            <Input
              id="ws-confirm"
              value={confirmValue}
              onChange={(e) => setConfirmValue(e.target.value)}
              placeholder={target?.name ?? ""}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => void onDelete()}
              disabled={deleting || confirmValue.trim() !== (target?.name ?? "")}
            >
              {deleting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Delete Workspace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
