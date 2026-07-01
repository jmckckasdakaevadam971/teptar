"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, TreePine } from "lucide-react";
import { api } from "@/lib/api";
import type { TreeNode } from "@/lib/types";
import type { Person as TreePerson } from "@/lib/demo-data";
import { TreeView } from "@/components/TreeView/TreeView";
import { CARD, ERR_TEXT } from "@/lib/ui";

/** Преобразовать узлы дерева из API в модель, понятную TreeView. */
export function toTreePeople(nodes: TreeNode[]): TreePerson[] {
  const ids = new Set(nodes.map((n) => n.id));
  return nodes.map((n) => ({
    id: String(n.id),
    name: n.full_name,
    birth: n.birth_year != null ? String(n.birth_year) : undefined,
    death: n.death_year != null ? String(n.death_year) : undefined,
    role: "",
    teip: "",
    generation: n.depth,
    parentId:
      n.father_id != null && ids.has(n.father_id)
        ? String(n.father_id)
        : undefined,
  }));
}

export function PublicTreeDetail({
  rootId,
  mergeId,
}: {
  rootId?: number;
  mergeId?: number;
}) {
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const load =
      mergeId != null
        ? api.tree.mergedTree(mergeId)
        : api.tree.fullTree(rootId as number);
    load
      .then((data) => {
        if (!cancelled) setNodes(data);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Не удалось загрузить древо",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rootId, mergeId]);

  const people = useMemo(() => toTreePeople(nodes), [nodes]);
  const selected = nodes.find((n) => String(n.id) === selectedId) ?? null;

  return (
    <div className="grid gap-6">
      <Link
        href="/trees"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />К списку древ
      </Link>

      {error ? (
        <p className={ERR_TEXT}>{error}</p>
      ) : loading ? (
        <p className="py-10 text-center text-muted-foreground">Загрузка…</p>
      ) : people.length === 0 ? (
        <div className={`${CARD} text-center`}>
          <TreePine className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 font-serif text-lg font-semibold text-foreground">
            Древо не найдено
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Возможно, оно ещё не прошло модерацию или было изменено.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Всего персон в древе: {people.length}
          </p>
          <TreeView
            people={people}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id)}
          />
          {selected ? (
            <div className={CARD}>
              <h3 className="font-serif text-lg font-semibold text-foreground">
                {selected.full_name}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {selected.birth_year ?? "?"}
                {selected.death_year ? ` – ${selected.death_year}` : ""}
              </p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
