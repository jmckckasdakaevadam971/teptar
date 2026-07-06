"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, GitBranch, Pencil, TreePine, X } from "lucide-react";
import { api } from "@/lib/api";
import type { BranchGrantInfo, TreeNode } from "@/lib/types";
import type { Person as TreePerson } from "@/lib/demo-data";
import { TreeView } from "@/components/TreeView/TreeView";
import { useAuth } from "@/lib/auth";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  CARD,
  ERR_TEXT,
  FIELD,
  INPUT,
  LABEL,
  OK_TEXT,
} from "@/lib/ui";

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
    spouseNames: n.spouse_names ?? undefined,
    mergeAdded: n.merge_added || undefined,
    mergeAuthor: n.merge_author ?? undefined,
    mergeAnchor: n.merge_anchor || undefined,
    parentId:
      n.father_id != null && ids.has(n.father_id)
        ? String(n.father_id)
        : undefined,
  }));
}

/** Черновик правки одной персоны ветви (локально, до отправки). */
interface DraftPatch {
  full_name?: string;
  birth_year?: number | null;
  death_year?: number | null;
  note?: string | null;
}

/** Форма редактирования персоны ветви. */
interface EditFormState {
  personId: number;
  initial: {
    full_name: string;
    birth_year: number | null;
    death_year: number | null;
    note: string | null;
  };
  full_name: string;
  birth: string;
  death: string;
  note: string;
}

/**
 * BIGINT из PostgreSQL приходит в JSON строкой — приводим идентификаторы
 * узлов к числам, иначе строгие сравнения (выбор ветви, подсветка) молча
 * не срабатывают.
 */
function normalizeNodes(data: TreeNode[]): TreeNode[] {
  return data.map((n) => ({
    ...n,
    id: Number(n.id),
    father_id: n.father_id != null ? Number(n.father_id) : null,
    mother_id: n.mother_id != null ? Number(n.mother_id) : null,
  }));
}

export function PublicTreeDetail({
  rootId,
  mergeId,
}: {
  rootId?: number;
  mergeId?: number;
}) {
  const { user, ready } = useAuth();
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // --- Запрос доступа к ветви -------------------------------------------
  const [grant, setGrant] = useState<BranchGrantInfo | null>(null);
  const [mode, setMode] = useState<"view" | "select" | "edit">("view");
  const [branchRootSel, setBranchRootSel] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Подсветка ветви по ссылке из письма/кабинета: /trees/ID?branch=X
  const [viewBranch, setViewBranch] = useState<number | null>(null);
  // Правки ветви: черновики до отправки на модерацию
  const [drafts, setDrafts] = useState<Record<number, DraftPatch>>({});
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [editLoading, setEditLoading] = useState(false);

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
        if (!cancelled) setNodes(normalizeNodes(data));
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

  // Мои права на этом древе (владелец / одобренные ветви).
  useEffect(() => {
    if (!ready || !user || rootId == null || mergeId != null) return;
    let cancelled = false;
    api.branchAccess
      .myGrant(rootId)
      .then((g) => {
        if (!cancelled) setGrant(g);
      })
      .catch(() => {
        /* нет прав — просто не показываем кнопки */
      });
    return () => {
      cancelled = true;
    };
  }, [ready, user, rootId, mergeId]);

  // Подсветка ветви из query-параметра (?branch=ID) — просмотр владельцем.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = new URLSearchParams(window.location.search).get("branch");
    const id = raw ? Number(raw) : NaN;
    if (Number.isFinite(id) && id > 0) setViewBranch(id);
  }, []);

  // Дети каждой персоны (по father_id/mother_id) — для расчёта ветви.
  const childrenMap = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const n of nodes) {
      for (const pid of [n.father_id, n.mother_id]) {
        if (pid == null) continue;
        const arr = map.get(pid);
        if (arr) arr.push(n.id);
        else map.set(pid, [n.id]);
      }
    }
    return map;
  }, [nodes]);

  /** Ветвь: человек + все его потомки (BFS по детям). */
  const branchOf = useCallback(
    (root: number): Set<number> => {
      const result = new Set<number>([root]);
      const queue = [root];
      while (queue.length > 0) {
        const cur = queue.shift() as number;
        for (const kid of childrenMap.get(cur) ?? []) {
          if (!result.has(kid)) {
            result.add(kid);
            queue.push(kid);
          }
        }
      }
      return result;
    },
    [childrenMap],
  );

  const editableSet = useMemo(
    () => new Set(grant?.editable_ids ?? []),
    [grant],
  );

  // Какие карточки подсветить оранжевым в текущем режиме.
  const highlightSet = useMemo(() => {
    if (mode === "select" && branchRootSel != null)
      return branchOf(branchRootSel);
    if (mode === "edit") return editableSet;
    if (viewBranch != null && nodes.some((n) => n.id === viewBranch))
      return branchOf(viewBranch);
    return null;
  }, [mode, branchRootSel, branchOf, editableSet, viewBranch, nodes]);

  const people = useMemo(() => {
    const base = toTreePeople(nodes);
    if (!highlightSet) return base;
    return base.map((p) =>
      highlightSet.has(Number(p.id)) ? { ...p, highlighted: true } : p,
    );
  }, [nodes, highlightSet]);

  const selected = nodes.find((n) => String(n.id) === selectedId) ?? null;
  const branchRootNode =
    branchRootSel != null
      ? (nodes.find((n) => n.id === branchRootSel) ?? null)
      : null;
  const draftCount = Object.keys(drafts).length;

  /** Открыть форму правки персоны ветви (текущие данные — с сервера). */
  const openEditForm = useCallback(
    async (personId: number) => {
      setEditLoading(true);
      setActionError(null);
      try {
        const p = await api.persons.get(personId);
        const patch = drafts[personId] ?? {};
        const initial = {
          full_name: p.full_name,
          birth_year: p.birth_year,
          death_year: p.death_year,
          note: p.note,
        };
        setEditForm({
          personId,
          initial,
          full_name: patch.full_name ?? initial.full_name,
          birth: String(patch.birth_year ?? initial.birth_year ?? ""),
          death: String(patch.death_year ?? initial.death_year ?? ""),
          note: patch.note ?? initial.note ?? "",
        });
      } catch (e: unknown) {
        setActionError(
          e instanceof Error ? e.message : "Не удалось загрузить данные",
        );
      } finally {
        setEditLoading(false);
      }
    },
    [drafts],
  );

  /** Клик по карточке в дереве — поведение зависит от режима. */
  const handleSelect = useCallback(
    (id: string) => {
      const numId = Number(id);
      if (mode === "select") {
        setBranchRootSel(numId);
        return;
      }
      if (mode === "edit" && editableSet.has(numId)) {
        void openEditForm(numId);
        return;
      }
      setSelectedId(id);
    },
    [mode, editableSet, openEditForm],
  );

  /** Сохранить форму в черновик (отправка — отдельной кнопкой). */
  const saveDraft = useCallback(() => {
    if (!editForm) return;
    const patch: DraftPatch = {};
    const name = editForm.full_name.trim();
    if (name && name !== editForm.initial.full_name) patch.full_name = name;
    const birth = editForm.birth.trim() === "" ? null : Number(editForm.birth);
    if (
      (birth === null || Number.isFinite(birth)) &&
      birth !== editForm.initial.birth_year
    )
      patch.birth_year = birth;
    const death = editForm.death.trim() === "" ? null : Number(editForm.death);
    if (
      (death === null || Number.isFinite(death)) &&
      death !== editForm.initial.death_year
    )
      patch.death_year = death;
    const note = editForm.note.trim() === "" ? null : editForm.note.trim();
    if (note !== (editForm.initial.note ?? null)) patch.note = note;

    setDrafts((prev) => {
      const next = { ...prev };
      if (Object.keys(patch).length === 0) delete next[editForm.personId];
      else next[editForm.personId] = patch;
      return next;
    });
    setEditForm(null);
  }, [editForm]);

  /** Отправить запрос доступа к выбранной ветви. */
  const submitRequest = useCallback(async () => {
    if (branchRootSel == null) return;
    setSending(true);
    setActionError(null);
    try {
      await api.branchAccess.request({
        branch_root_id: branchRootSel,
        comment: comment.trim() || null,
      });
      setMode("view");
      setBranchRootSel(null);
      setComment("");
      setNotice(
        "Запрос отправлен владельцу родословной. Решение придёт вам на почту.",
      );
    } catch (e: unknown) {
      setActionError(
        e instanceof Error ? e.message : "Не удалось отправить запрос",
      );
    } finally {
      setSending(false);
    }
  }, [branchRootSel, comment]);

  /** Отправить все черновики правок на модерацию. */
  const submitDrafts = useCallback(async () => {
    const entries = Object.entries(drafts);
    if (entries.length === 0) return;
    setSending(true);
    setActionError(null);
    try {
      for (const [pid, patch] of entries) {
        await api.persons.update(Number(pid), patch);
      }
      setDrafts({});
      setMode("view");
      setNotice(
        "Изменения отправлены на модерацию. Опубликованная родословная обновится после одобрения модератором.",
      );
    } catch (e: unknown) {
      setActionError(
        e instanceof Error ? e.message : "Не удалось отправить изменения",
      );
    } finally {
      setSending(false);
    }
  }, [drafts]);

  const canRequest =
    ready &&
    user != null &&
    rootId != null &&
    mergeId == null &&
    grant != null &&
    !grant.is_owner;

  return (
    <div className="grid min-w-0 gap-6">
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
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">
              Всего персон в древе: {people.length}
            </p>
            {canRequest && mode === "view" ? (
              <button
                type="button"
                className={BTN_SECONDARY}
                onClick={() => {
                  setNotice(null);
                  setActionError(null);
                  setBranchRootSel(null);
                  setMode("select");
                }}
              >
                <GitBranch className="h-4 w-4" />
                Запросить доступ к ветви
              </button>
            ) : null}
            {canRequest && grant.grants.length > 0 && mode === "view" ? (
              <button
                type="button"
                className={BTN_PRIMARY}
                onClick={() => {
                  setNotice(null);
                  setActionError(null);
                  setMode("edit");
                }}
              >
                <Pencil className="h-4 w-4" />
                Редактировать ветвь
              </button>
            ) : null}
          </div>

          {notice ? <p className={OK_TEXT}>{notice}</p> : null}
          {actionError ? <p className={ERR_TEXT}>{actionError}</p> : null}

          {mode === "select" ? (
            <div className={`${CARD} grid gap-4`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-serif text-lg font-semibold text-foreground">
                    Выбор ветви
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Нажмите на человека, с которого начинается нужная вам
                    ветвь, — она подсветится вместе со всеми потомками.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Отменить выбор ветви"
                  className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  onClick={() => {
                    setMode("view");
                    setBranchRootSel(null);
                    setComment("");
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {branchRootNode ? (
                <>
                  <p className="text-sm text-foreground">
                    Выбрана ветвь:{" "}
                    <strong>{branchRootNode.full_name}</strong>{" "}
                    <span className="text-muted-foreground">
                      (людей в ветви: {branchOf(branchRootNode.id).size})
                    </span>
                  </p>
                  <div className={FIELD}>
                    <label className={LABEL} htmlFor="branch-comment">
                      Комментарий владельцу (необязательно)
                    </label>
                    <textarea
                      id="branch-comment"
                      className={`${INPUT} min-h-24 resize-y`}
                      placeholder="Например: это ветвь моего деда, хочу дополнить её сведениями"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      maxLength={2000}
                    />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      className={BTN_PRIMARY}
                      disabled={sending}
                      onClick={() => void submitRequest()}
                    >
                      {sending ? "Отправка…" : "Отправить запрос"}
                    </button>
                    <button
                      type="button"
                      className={BTN_SECONDARY}
                      onClick={() => setBranchRootSel(null)}
                    >
                      Выбрать другого человека
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Ветвь пока не выбрана.
                </p>
              )}
            </div>
          ) : null}

          {mode === "edit" ? (
            <div className={`${CARD} grid gap-4`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-serif text-lg font-semibold text-foreground">
                    Редактирование ветви
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Вам доступны карточки, подсвеченные оранжевым. Нажмите на
                    карточку, внесите правки — изменения применятся к
                    опубликованной родословной только после проверки
                    модератором.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Выйти из режима редактирования"
                  className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  onClick={() => {
                    setMode("view");
                    setEditForm(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className={BTN_PRIMARY}
                  disabled={sending || draftCount === 0}
                  onClick={() => void submitDrafts()}
                >
                  {sending
                    ? "Отправка…"
                    : `Отправить изменения на модерацию (${draftCount})`}
                </button>
                {draftCount > 0 ? (
                  <button
                    type="button"
                    className={BTN_SECONDARY}
                    onClick={() => setDrafts({})}
                  >
                    Сбросить черновики
                  </button>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    Изменений пока нет.
                  </span>
                )}
              </div>
            </div>
          ) : null}

          {people.some((p) => p.mergeAdded) ? (
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="rounded-full border border-success-border bg-success-bg px-2 py-0.5 text-[10px] font-medium text-success">
                Добавлено
              </span>
              — ветвь, присоединённая при объединении родословных. Наведите на
              карточку, чтобы увидеть источник.
            </p>
          ) : null}
          <TreeView
            people={people}
            selectedId={selectedId}
            onSelect={handleSelect}
          />
          {selected && mode === "view" ? (
            <div className={CARD}>
              <h3 className="font-serif text-lg font-semibold text-foreground">
                {selected.full_name}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {selected.birth_year ?? "?"}
                {selected.death_year ? ` – ${selected.death_year}` : ""}
              </p>
              {selected.merge_added ? (
                <p className="mt-2 text-sm text-success">
                  Добавлено при объединении родословных
                  {selected.merge_author
                    ? ` · Источник: родословная пользователя ${selected.merge_author}`
                    : ""}
                </p>
              ) : selected.merge_anchor ? (
                <p className="mt-2 text-sm text-primary">
                  Точка объединения родословных
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      {editLoading ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40">
          <p className="rounded-xl bg-card px-6 py-4 text-sm text-foreground">
            Загрузка данных…
          </p>
        </div>
      ) : null}

      {editForm ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className={`${CARD} w-full max-w-md`}>
            <h3 className="font-serif text-lg font-semibold text-foreground">
              Правка карточки
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Изменения попадут в черновик и будут отправлены на модерацию.
            </p>
            <div className="mt-4 grid gap-4">
              <div className={FIELD}>
                <label className={LABEL} htmlFor="ef-name">
                  ФИО
                </label>
                <input
                  id="ef-name"
                  className={INPUT}
                  value={editForm.full_name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, full_name: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className={FIELD}>
                  <label className={LABEL} htmlFor="ef-birth">
                    Год рождения
                  </label>
                  <input
                    id="ef-birth"
                    className={INPUT}
                    inputMode="numeric"
                    value={editForm.birth}
                    onChange={(e) =>
                      setEditForm({ ...editForm, birth: e.target.value })
                    }
                  />
                </div>
                <div className={FIELD}>
                  <label className={LABEL} htmlFor="ef-death">
                    Год смерти
                  </label>
                  <input
                    id="ef-death"
                    className={INPUT}
                    inputMode="numeric"
                    value={editForm.death}
                    onChange={(e) =>
                      setEditForm({ ...editForm, death: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className={FIELD}>
                <label className={LABEL} htmlFor="ef-note">
                  Заметка
                </label>
                <textarea
                  id="ef-note"
                  className={`${INPUT} min-h-24 resize-y`}
                  value={editForm.note}
                  onChange={(e) =>
                    setEditForm({ ...editForm, note: e.target.value })
                  }
                  maxLength={5000}
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className={BTN_PRIMARY}
                  onClick={saveDraft}
                >
                  Сохранить в черновик
                </button>
                <button
                  type="button"
                  className={BTN_SECONDARY}
                  onClick={() => setEditForm(null)}
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
