"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { TreeView } from "@/components/TreeView/TreeView";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  CARD,
  LINK_DANGER,
  TABLE,
  TABLE_WRAP,
} from "@/lib/ui";
import type {
  PendingTree,
  Person,
  DuplicatePair,
  MergeSuggestion,
  MergeAnchor,
  MergeParty,
  TreeMerge,
  TreeChange,
  TreeNode,
} from "@/lib/types";
import type { Person as TreePerson } from "@/lib/demo-data";

/** Описание диапазона лет древа. */
function yearsLabel(min: number | null, max: number | null): string {
  if (min == null && max == null) return "годы не указаны";
  if (min != null && max != null) return `${min}–${max} гг.`;
  return `${min ?? max} г.`;
}

/** Годы жизни одной персоны. */
function personYears(p: Person): string {
  if (!p.birth_year && !p.death_year) return "—";
  return `${p.birth_year ?? "?"} – ${p.death_year ?? (p.is_alive ? "н.в." : "?")}`;
}

/** Преобразовать персоны из бэкенда в формат визуального древа TreeView. */
function toTreePeople(persons: Person[]): TreePerson[] {
  const byId = new Map(persons.map((p) => [p.id, p]));
  const genCache = new Map<number, number>();
  const genOf = (p: Person, seen = new Set<number>()): number => {
    const cached = genCache.get(p.id);
    if (cached != null) return cached;
    if (seen.has(p.id)) return 0;
    seen.add(p.id);
    const father = p.father_id != null ? byId.get(p.father_id) : undefined;
    const g = father ? genOf(father, seen) + 1 : 0;
    genCache.set(p.id, g);
    return g;
  };
  return persons.map((p) => ({
    id: String(p.id),
    name: p.full_name,
    birth: p.birth_year != null ? String(p.birth_year) : undefined,
    death: p.death_year != null ? String(p.death_year) : undefined,
    role: p.gender === "f" ? "дочь" : "сын",
    teip: "",
    bio: p.note ?? undefined,
    generation: genOf(p),
    parentId:
      p.father_id != null && byId.has(p.father_id)
        ? String(p.father_id)
        : undefined,
  }));
}

/** Узлы объединённого древа (из /ancestors/:id/full) в формат TreeView. */
function fullTreeToPeople(nodes: TreeNode[]): TreePerson[] {
  const ids = new Set(nodes.map((n) => n.id));
  return nodes.map((n) => ({
    id: String(n.id),
    name: n.full_name,
    birth: n.birth_year != null ? String(n.birth_year) : undefined,
    death: n.death_year != null ? String(n.death_year) : undefined,
    role: n.gender === "f" ? "дочь" : "сын",
    teip: "",
    generation: n.depth,
    parentId:
      n.father_id != null && ids.has(n.father_id)
        ? String(n.father_id)
        : undefined,
  }));
}

/** Человеко-читаемые названия полей для diff. */
const FIELD_RU: Record<string, string> = {
  full_name: "ФИО",
  gender: "Пол",
  birth_year: "Год рождения",
  death_year: "Год смерти",
  teip_id: "Тейп",
  gar_id: "Гар",
  village_id: "Село",
  note: "Примечание",
  father_id: "Отец",
  mother_id: "Мать",
};

/**
 * Очередь модерации общей базы: древа, отправленные пользователями.
 * Модератор может развернуть древо и посмотреть персоны перед решением.
 * Одобрение/отклонение применяется ко всему древу пользователя сразу.
 */
export function ModerationPanel() {
  const [trees, setTrees] = useState<PendingTree[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Просмотр: какое древо открыто в модальном окне и кэш загруженных персон.
  const [viewerId, setViewerId] = useState<number | null>(null);
  const [viewerSelected, setViewerSelected] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [preview, setPreview] = useState<Record<number, Person[]>>({});
  const [previewLoading, setPreviewLoading] = useState(false);
  // Возможные дубли с другими древами (по владельцу).
  const [duplicates, setDuplicates] = useState<Record<number, DuplicatePair[]>>(
    {},
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTrees(await api.moderation.pending());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => setMounted(true), []);

  async function openViewer(ownerId: number) {
    setViewerId(ownerId);
    setViewerSelected(null);
    setConfirmReject(false);
    setError(null);
    if (!preview[ownerId]) {
      setPreviewLoading(true);
      try {
        const [persons, dups] = await Promise.all([
          api.moderation.persons(ownerId),
          api.moderation.duplicates(ownerId).catch(() => [] as DuplicatePair[]),
        ]);
        setPreview((prev) => ({ ...prev, [ownerId]: persons }));
        setDuplicates((prev) => ({ ...prev, [ownerId]: dups }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось загрузить древо");
        setViewerId(null);
      } finally {
        setPreviewLoading(false);
      }
    }
  }

  async function decide(
    ownerId: number,
    action: "approve" | "reject",
    _name: string,
  ) {
    setBusyId(ownerId);
    setError(null);
    try {
      await api.moderation[action](ownerId);
      setTrees((prev) => prev.filter((t) => t.owner_id !== ownerId));
      if (viewerId === ownerId) {
        setViewerId(null);
        setConfirmReject(false);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось выполнить действие",
      );
    } finally {
      setBusyId(null);
    }
  }

  /** Объединить две записи: keep остаётся, drop удаляется и перепривязывается. */
  async function merge(ownerId: number, keepId: number, dropId: number) {
    if (!confirm("Объединить эти две записи? Действие необратимо.")) return;
    setBusyId(ownerId);
    setError(null);
    try {
      await api.moderation.merge(keepId, dropId);
      const [persons, dups] = await Promise.all([
        api.moderation.persons(ownerId),
        api.moderation.duplicates(ownerId).catch(() => [] as DuplicatePair[]),
      ]);
      setPreview((prev) => ({ ...prev, [ownerId]: persons }));
      setDuplicates((prev) => ({ ...prev, [ownerId]: dups }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось объединить");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className={CARD}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="m-0 text-xl font-semibold text-cream">
          Модерация общей базы
        </h2>
        <button
          type="button"
          className={BTN_SECONDARY}
          onClick={() => void load()}
          disabled={loading}
        >
          Обновить
        </button>
      </div>

      {error && <p className="text-sm text-[#b91c1c]">{error}</p>}

      {loading ? (
        <p className="text-sand">Загрузка…</p>
      ) : trees.length === 0 ? (
        <p className="text-sand">Нет древ, ожидающих модерации.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {trees.map((t) => (
            <div
              key={t.owner_id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5"
            >
              <div className="flex min-w-[200px] flex-1 items-center gap-2.5 text-cream">
                <span className="text-[15px] font-bold text-gold-light">
                  {t.owner_name}
                </span>
                <span className="text-[13px] text-sand">
                  {t.count} {t.count === 1 ? "персона" : "персон"} ·{" "}
                  {yearsLabel(t.min_year, t.max_year)}
                </span>
              </div>
              <button
                type="button"
                className={BTN_PRIMARY}
                disabled={busyId === t.owner_id}
                onClick={() => void openViewer(t.owner_id)}
              >
                Просмотреть древо
              </button>
            </div>
          ))}
        </div>
      )}

      {mounted &&
        viewerId != null &&
        createPortal(
          (() => {
            const t = trees.find((x) => x.owner_id === viewerId);
            if (!t) return null;
            const persons = preview[viewerId];
            const dups = duplicates[viewerId] ?? [];
            return (
              <div className="fixed inset-0 z-[70] flex flex-col bg-background">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
                  <div className="flex min-w-[200px] items-center gap-2.5">
                    <button
                      type="button"
                      className={BTN_SECONDARY}
                      onClick={() => {
                        setViewerId(null);
                        setConfirmReject(false);
                      }}
                    >
                      ← Назад
                    </button>
                    <span className="text-[16px] font-bold text-gold-light">
                      {t.owner_name}
                    </span>
                    <span className="text-[13px] text-sand">
                      {t.count} {t.count === 1 ? "персона" : "персон"} ·{" "}
                      {yearsLabel(t.min_year, t.max_year)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className={BTN_PRIMARY}
                      disabled={busyId === t.owner_id}
                      onClick={() =>
                        void decide(t.owner_id, "approve", t.owner_name)
                      }
                    >
                      ✓ Одобрить
                    </button>
                    {confirmReject ? (
                      <span className="flex flex-wrap items-center gap-2 text-[13px] text-sand">
                        Отклонить и вернуть автору?
                        <button
                          type="button"
                          className={LINK_DANGER}
                          disabled={busyId === t.owner_id}
                          onClick={() =>
                            void decide(t.owner_id, "reject", t.owner_name)
                          }
                        >
                          {busyId === t.owner_id
                            ? "Отклоняем…"
                            : "Да, отклонить"}
                        </button>
                        <button
                          type="button"
                          className={BTN_SECONDARY}
                          disabled={busyId === t.owner_id}
                          onClick={() => setConfirmReject(false)}
                        >
                          Отмена
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={LINK_DANGER}
                        disabled={busyId === t.owner_id}
                        onClick={() => setConfirmReject(true)}
                      >
                        ✖ Отклонить
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-auto p-4">
                  {error && (
                    <p className="mb-3 text-sm text-[#b91c1c]">{error}</p>
                  )}
                  {previewLoading && !persons ? (
                    <p className="text-sand">Загрузка древа…</p>
                  ) : persons && persons.length > 0 ? (
                    <>
                      <div className="rounded-xl border border-line bg-gold/[0.03] p-2">
                        <TreeView
                          people={toTreePeople(persons)}
                          selectedId={viewerSelected}
                          onSelect={setViewerSelected}
                        />
                      </div>

                      <div className="mt-4">
                        <span className="text-[13px] text-sand">
                          Персоны древа ({persons.length})
                        </span>
                        <div className={`${TABLE_WRAP} mt-2`}>
                          <table className={TABLE}>
                            <thead>
                              <tr>
                                <th>ФИО</th>
                                <th>Пол</th>
                                <th>Годы</th>
                                <th>Примечание</th>
                              </tr>
                            </thead>
                            <tbody>
                              {persons.map((p) => (
                                <tr key={p.id}>
                                  <td>{p.full_name}</td>
                                  <td>{p.gender === "f" ? "жен." : "муж."}</td>
                                  <td className="whitespace-nowrap">
                                    {personYears(p)}
                                  </td>
                                  <td className="whitespace-normal text-sand">
                                    {p.note ?? "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {dups.length > 0 && (
                        <div className="mt-4 rounded-lg border border-gold-soft bg-gold/[0.06] p-3">
                          <p className="m-0 mb-2 text-[13px] font-bold text-gold-light">
                            ⚠ Возможные совпадения с другими древами (
                            {dups.length})
                          </p>
                          <div className="flex flex-col gap-2">
                            {dups.map((d, i) => (
                              <div
                                key={`${d.person.id}-${d.candidate.id}-${i}`}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line px-2.5 py-2"
                              >
                                <div className="min-w-[220px] flex-1 text-[13px] text-cream">
                                  <span className="text-gold-light">
                                    {d.person.full_name}
                                  </span>
                                  <span className="text-sand">
                                    {" "}
                                    ({d.person.birth_year ?? "?"})
                                  </span>
                                  <span className="text-sand"> ↔ </span>
                                  <span className="text-gold-light">
                                    {d.candidate.full_name}
                                  </span>
                                  <span className="text-sand">
                                    {" "}
                                    ({d.candidate.birth_year ?? "?"})
                                  </span>
                                  <span className="text-sand">
                                    {" · "}
                                    {d.candidate.owner_name ?? "другой автор"} ·
                                    ~{Math.round(d.candidate.similarity * 100)}%
                                  </span>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    className={`${BTN_SECONDARY} !px-2.5 !py-1 !text-[12px]`}
                                    disabled={busyId === t.owner_id}
                                    onClick={() =>
                                      void merge(
                                        t.owner_id,
                                        d.candidate.id,
                                        d.person.id,
                                      )
                                    }
                                  >
                                    Оставить чужую
                                  </button>
                                  <button
                                    type="button"
                                    className={`${BTN_PRIMARY} !px-2.5 !py-1 !text-[12px]`}
                                    disabled={busyId === t.owner_id}
                                    onClick={() =>
                                      void merge(
                                        t.owner_id,
                                        d.person.id,
                                        d.candidate.id,
                                      )
                                    }
                                  >
                                    Оставить эту
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sand">
                      В этом древе нет персон на модерации.
                    </p>
                  )}
                </div>
              </div>
            );
          })(),
          document.body,
        )}

      <MergeSuggestionsQueue />

      <PendingMergesQueue />

      <EditQueue />
    </div>
  );
}

/** Годы жизни человека одной строкой. */
function anchorYears(birth: number | null, death: number | null): string {
  return birth || death
    ? `${birth ?? "?"} – ${death ?? "?"}`
    : "годы не указаны";
}

/** Мини-схема одного древа вокруг общего предка: отец → предок → дети. */
function AnchorTree({
  owner,
  anchor,
}: {
  owner: MergeParty;
  anchor: MergeAnchor;
}) {
  return (
    <div className="flex-1 rounded-lg border border-line bg-background/40 p-3">
      <div className="mb-1.5 text-[12px] font-semibold text-sand">
        Древо: {owner.owner_name ?? "—"}
      </div>

      {anchor.father_name && (
        <div className="mb-1">
          <div className="text-[13px] text-sand">{anchor.father_name}</div>
          <div className="ml-1 text-[11px] text-sand/70">↑ отец</div>
        </div>
      )}

      <div className="rounded-md border border-gold-soft bg-gold/[0.08] px-2.5 py-1.5">
        <div className="text-[15px] font-bold text-gold-light">
          {anchor.full_name}
        </div>
        <div className="text-[12px] text-sand">
          {anchorYears(anchor.birth_year, anchor.death_year)}
        </div>
        {anchor.teip_name && (
          <div className="text-[12px] text-sand">Тейп: {anchor.teip_name}</div>
        )}
        <span className="mt-1 inline-block rounded bg-gold/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gold-light">
          общий предок
        </span>
      </div>

      {anchor.children.length > 0 && (
        <div className="ml-2 mt-1 border-l border-line pl-3">
          <div className="text-[11px] text-sand/70">↓ дети</div>
          {anchor.children.map((c) => (
            <div key={c.id} className="text-[13px] text-cream">
              {c.full_name}
              {c.birth_year != null && (
                <span className="text-sand"> ({c.birth_year})</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Выбрать сторону с более полными данными — как основу по умолчанию. */
function completeness(a: MergeAnchor): number {
  return (
    (a.birth_year != null ? 1 : 0) +
    (a.death_year != null ? 1 : 0) +
    (a.note ? 1 : 0) +
    a.full_name.length / 100
  );
}

/**
 * Карточка одного предложения: две мини-схемы древ, общий предок и форма
 * объединения. Модератор выбирает основу и итоговые поля предка, затем
 * «Объединить древа» — обе ветки срастаются под одним предком.
 */
function MergeCard({
  s,
  busy,
  onMerge,
  onDismiss,
}: {
  s: MergeSuggestion;
  busy: boolean;
  onMerge: (
    keepId: number,
    fields: {
      full_name: string;
      birth_year: number | null;
      death_year: number | null;
      note: string | null;
    },
  ) => void;
  onDismiss: () => void;
}) {
  const defaultBase =
    completeness(s.anchor_b) > completeness(s.anchor_a)
      ? s.anchor_b.id
      : s.anchor_a.id;

  const [open, setOpen] = useState(false);
  const [confirmDismiss, setConfirmDismiss] = useState(false);
  const [keepId, setKeepId] = useState(defaultBase);

  const base = keepId === s.anchor_a.id ? s.anchor_a : s.anchor_b;
  const other = keepId === s.anchor_a.id ? s.anchor_b : s.anchor_a;

  // Итоговые поля предка: берём из основы, недостающее — из второй записи.
  const [name, setName] = useState(base.full_name);
  const [birth, setBirth] = useState<string>(
    (base.birth_year ?? other.birth_year ?? "").toString(),
  );
  const [death, setDeath] = useState<string>(
    (base.death_year ?? other.death_year ?? "").toString(),
  );
  const [note, setNote] = useState<string>(base.note ?? other.note ?? "");

  function chooseBase(id: number) {
    setKeepId(id);
    const b = id === s.anchor_a.id ? s.anchor_a : s.anchor_b;
    const o = id === s.anchor_a.id ? s.anchor_b : s.anchor_a;
    setName(b.full_name);
    setBirth((b.birth_year ?? o.birth_year ?? "").toString());
    setDeath((b.death_year ?? o.death_year ?? "").toString());
    setNote(b.note ?? o.note ?? "");
  }

  function submit() {
    onMerge(keepId, {
      full_name: name.trim() || base.full_name,
      birth_year: birth.trim() ? Number(birth) : null,
      death_year: death.trim() ? Number(death) : null,
      note: note.trim() ? note.trim() : null,
    });
  }

  const inputCls =
    "w-full rounded-md border border-line bg-background/60 px-2 py-1 text-[13px] text-cream outline-none focus:border-gold-soft";

  return (
    <div className="rounded-xl border border-gold-soft bg-gold/[0.05] p-3">
      <div className="mb-2 text-[12px] text-sand">
        Похоже, это одно древо — общий предок{" "}
        <b className="text-gold-light">{s.anchor_a.full_name}</b> (совпадение ~
        {Math.round(s.similarity * 100)}%)
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <AnchorTree owner={s.owner_a} anchor={s.anchor_a} />
        <div className="flex items-center justify-center text-lg text-sand">
          ⇄
        </div>
        <AnchorTree owner={s.owner_b} anchor={s.anchor_b} />
      </div>

      {open && (
        <div className="mt-3 rounded-lg border border-line bg-background/40 p-3">
          <div className="mb-2 text-[13px] font-semibold text-cream">
            Данные общего предка после объединения
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-sand">
            За основу:
            <button
              type="button"
              className={
                keepId === s.anchor_a.id
                  ? `${BTN_PRIMARY} !px-2.5 !py-1 !text-[12px]`
                  : `${BTN_SECONDARY} !px-2.5 !py-1 !text-[12px]`
              }
              onClick={() => chooseBase(s.anchor_a.id)}
            >
              {s.owner_a.owner_name ?? "Древо A"}
            </button>
            <button
              type="button"
              className={
                keepId === s.anchor_b.id
                  ? `${BTN_PRIMARY} !px-2.5 !py-1 !text-[12px]`
                  : `${BTN_SECONDARY} !px-2.5 !py-1 !text-[12px]`
              }
              onClick={() => chooseBase(s.anchor_b.id)}
            >
              {s.owner_b.owner_name ?? "Древо B"}
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-[12px] text-sand">
              Имя
              <input
                className={inputCls}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[12px] text-sand">
                Год рождения
                <input
                  className={inputCls}
                  inputMode="numeric"
                  value={birth}
                  onChange={(e) => setBirth(e.target.value)}
                />
              </label>
              <label className="text-[12px] text-sand">
                Год смерти
                <input
                  className={inputCls}
                  inputMode="numeric"
                  value={death}
                  onChange={(e) => setDeath(e.target.value)}
                />
              </label>
            </div>
            <label className="text-[12px] text-sand sm:col-span-2">
              Примечание
              <textarea
                className={`${inputCls} min-h-[52px]`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={`${BTN_PRIMARY} !px-3 !py-1.5 !text-[13px]`}
              disabled={busy}
              onClick={submit}
            >
              Подтвердить объединение
            </button>
            <button
              type="button"
              className={`${BTN_SECONDARY} !px-3 !py-1.5 !text-[13px]`}
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {!open && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`${BTN_PRIMARY} !px-3 !py-1.5 !text-[13px]`}
            disabled={busy}
            onClick={() => setOpen(true)}
          >
            Объединить древа
          </button>
          {confirmDismiss ? (
            <span className="flex items-center gap-2 text-[13px] text-sand">
              Это разные люди?
              <button
                type="button"
                className={LINK_DANGER}
                disabled={busy}
                onClick={onDismiss}
              >
                Да, не совпадают
              </button>
              <button
                type="button"
                className={BTN_SECONDARY}
                disabled={busy}
                onClick={() => setConfirmDismiss(false)}
              >
                Отмена
              </button>
            </span>
          ) : (
            <button
              type="button"
              className={LINK_DANGER}
              disabled={busy}
              onClick={() => setConfirmDismiss(true)}
            >
              Не совпадают
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Очередь авто-предложений срастить два древа по общему предку.
 * Одно предложение на пару древ — по самому надёжному совпадению.
 */
/** Предложение уже неактуально (слито/пересоздано/персона удалена). */
function isStale(e: unknown): boolean {
  const status = (e as { status?: number } | null)?.status;
  const msg = e instanceof Error ? e.message.toLowerCase() : "";
  return status === 404 || msg.includes("не найдено");
}

function MergeSuggestionsQueue() {
  const [items, setItems] = useState<MergeSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [preview, setPreview] = useState<{
    mergeId: number;
    nodes: TreeNode[] | null;
    loading: boolean;
    selectedId: string | null;
  } | null>(null);

  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await api.moderation.mergeSuggestions());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openPreview(mergeId: number) {
    setPreview({ mergeId, nodes: null, loading: true, selectedId: null });
    try {
      const nodes = await api.tree.mergedTree(mergeId);
      setPreview((prev) =>
        prev && prev.mergeId === mergeId
          ? { ...prev, nodes, loading: false }
          : prev,
      );
    } catch {
      setPreview((prev) =>
        prev && prev.mergeId === mergeId
          ? { ...prev, nodes: [], loading: false }
          : prev,
      );
    }
  }

  async function merge(
    id: number,
    keepId: number,
    fields: {
      full_name: string;
      birth_year: number | null;
      death_year: number | null;
      note: string | null;
    },
  ) {
    setBusy(id);
    setError(null);
    try {
      const res = await api.moderation.resolveMerge(id, keepId, fields);
      setItems((prev) => prev.filter((x) => x.id !== id));
      void openPreview(res.tree_merge_id);
    } catch (e) {
      if (isStale(e)) {
        setItems((prev) => prev.filter((x) => x.id !== id));
        setError(
          "Это предложение уже неактуально (древо изменилось). Список обновлён.",
        );
        void load();
      } else {
        setError(e instanceof Error ? e.message : "Не удалось объединить");
      }
    } finally {
      setBusy(null);
    }
  }

  async function dismiss(id: number) {
    setBusy(id);
    setError(null);
    try {
      await api.moderation.dismissMerge(id);
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (e) {
      if (isStale(e)) {
        setItems((prev) => prev.filter((x) => x.id !== id));
        setError("Это предложение уже неактуально. Список обновлён.");
        void load();
      } else {
        setError(e instanceof Error ? e.message : "Не удалось отклонить");
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-6 border-t border-line pt-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="m-0 text-lg font-semibold text-cream">
          Предложения объединить древа
        </h3>
        <button
          type="button"
          className={BTN_SECONDARY}
          onClick={() => void load()}
          disabled={loading}
        >
          Обновить
        </button>
      </div>

      <p className="mb-3 text-[13px] text-sand">
        Система нашла древа с общим предком. Объедините — и создастся отдельное
        общее древо (обе ветки под этим предком). Исходные древа не меняются.
        Общее древо уйдёт на повторную проверку и станет видно всем после
        одобрения; либо отклоните, если это разные люди.
      </p>

      {error && <p className="text-sm text-[#b91c1c]">{error}</p>}

      {loading ? (
        <p className="text-sand">Загрузка…</p>
      ) : items.length === 0 ? (
        <p className="text-sand">Пока нет предложений объединения.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.map((s) => (
            <MergeCard
              key={s.id}
              s={s}
              busy={busy === s.id}
              onMerge={(keepId, fields) => void merge(s.id, keepId, fields)}
              onDismiss={() => void dismiss(s.id)}
            />
          ))}
        </div>
      )}

      {mounted &&
        preview &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex flex-col bg-background">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div className="flex min-w-[200px] items-center gap-2.5">
                <span className="text-[16px] font-bold text-gold-light">
                  Общее древо отправлено на проверку
                </span>
                <span className="text-[13px] text-sand">
                  Так оно будет выглядеть. Появится у всех после одобрения в
                  разделе «Объединённые древа на проверке» ниже.
                </span>
              </div>
              <button
                type="button"
                className={BTN_PRIMARY}
                onClick={() => setPreview(null)}
              >
                Готово
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {preview.loading && !preview.nodes ? (
                <p className="text-sand">Строим общее древо…</p>
              ) : preview.nodes && preview.nodes.length > 0 ? (
                <div className="rounded-xl border border-line bg-gold/[0.03] p-2">
                  <TreeView
                    people={fullTreeToPeople(preview.nodes)}
                    selectedId={preview.selectedId}
                    onSelect={(id) =>
                      setPreview((prev) =>
                        prev ? { ...prev, selectedId: id } : prev,
                      )
                    }
                  />
                </div>
              ) : (
                <p className="text-sand">
                  Отправлено на проверку, но построить схему не удалось.
                </p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/**
 * Очередь объединённых (общих) древ на повторной проверке.
 * Модератор смотрит собранное общее древо целиком и одобряет (публикует)
 * либо отклоняет. Исходные древа при этом не затрагиваются.
 */
function PendingMergesQueue() {
  const [items, setItems] = useState<TreeMerge[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [preview, setPreview] = useState<{
    id: number;
    nodes: TreeNode[] | null;
    loading: boolean;
    selectedId: string | null;
  } | null>(null);

  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await api.moderation.pendingMerges());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openPreview(id: number) {
    setPreview({ id, nodes: null, loading: true, selectedId: null });
    try {
      const nodes = await api.tree.mergedTree(id);
      setPreview((prev) =>
        prev && prev.id === id ? { ...prev, nodes, loading: false } : prev,
      );
    } catch {
      setPreview((prev) =>
        prev && prev.id === id ? { ...prev, nodes: [], loading: false } : prev,
      );
    }
  }

  async function decide(id: number, action: "approveMerge" | "rejectMerge") {
    setBusy(id);
    setError(null);
    try {
      await api.moderation[action](id);
      setItems((prev) => prev.filter((x) => x.id !== id));
      if (preview?.id === id) setPreview(null);
    } catch (e) {
      if (isStale(e)) {
        setItems((prev) => prev.filter((x) => x.id !== id));
        setError("Это объединение уже неактуально. Список обновлён.");
        void load();
      } else {
        setError(e instanceof Error ? e.message : "Не удалось выполнить");
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-6 border-t border-line pt-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="m-0 text-lg font-semibold text-cream">
          Объединённые древа на проверке
        </h3>
        <button
          type="button"
          className={BTN_SECONDARY}
          onClick={() => void load()}
          disabled={loading}
        >
          Обновить
        </button>
      </div>

      <p className="mb-3 text-[13px] text-sand">
        Это общие древа, собранные из двух веток по общему предку. Проверьте
        целиком и одобрите — тогда общее древо появится у всех в разделе
        «Древа». Исходные древа обоих владельцев остаются нетронутыми.
      </p>

      {error && <p className="text-sm text-[#b91c1c]">{error}</p>}

      {loading ? (
        <p className="text-sand">Загрузка…</p>
      ) : items.length === 0 ? (
        <p className="text-sand">Пока нет общих древ на проверке.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.map((m) => (
            <div
              key={m.id}
              className="rounded-xl border border-line bg-gold/[0.03] p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-[220px]">
                  <p className="m-0 text-[15px] font-semibold text-cream">
                    {m.merged_name}
                    {m.merged_birth_year != null && (
                      <span className="ml-2 text-[13px] font-normal text-sand">
                        {m.merged_birth_year}
                        {m.merged_death_year != null
                          ? `–${m.merged_death_year}`
                          : ""}{" "}
                        гг.
                      </span>
                    )}
                  </p>
                  <p className="m-0 mt-1 text-[13px] text-sand">
                    Общий предок двух древ · всего {m.total}{" "}
                    {personWord(m.total)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
                    <span className="rounded-md border border-line px-2 py-1 text-sand">
                      Ветка A: {m.branch_a.owner_name ?? "—"} ({m.branch_a.size}
                      )
                    </span>
                    <span className="rounded-md border border-line px-2 py-1 text-sand">
                      Ветка B: {m.branch_b.owner_name ?? "—"} ({m.branch_b.size}
                      )
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={`${BTN_SECONDARY} !px-3 !py-1.5 !text-[13px]`}
                    disabled={busy === m.id}
                    onClick={() => void openPreview(m.id)}
                  >
                    Показать древо
                  </button>
                  <button
                    type="button"
                    className={`${BTN_PRIMARY} !px-3 !py-1.5 !text-[13px]`}
                    disabled={busy === m.id}
                    onClick={() => void decide(m.id, "approveMerge")}
                  >
                    Одобрить и опубликовать
                  </button>
                  <button
                    type="button"
                    className={LINK_DANGER}
                    disabled={busy === m.id}
                    onClick={() => void decide(m.id, "rejectMerge")}
                  >
                    Отклонить
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {mounted &&
        preview &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex flex-col bg-background">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div className="flex min-w-[200px] items-center gap-2.5">
                <span className="text-[16px] font-bold text-gold-light">
                  Общее древо (на проверке)
                </span>
                <span className="text-[13px] text-sand">
                  Проверьте целиком, затем одобрите или отклоните.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={`${BTN_PRIMARY} !px-3 !py-1.5 !text-[13px]`}
                  disabled={busy === preview.id}
                  onClick={() => void decide(preview.id, "approveMerge")}
                >
                  Одобрить
                </button>
                <button
                  type="button"
                  className={BTN_SECONDARY}
                  onClick={() => setPreview(null)}
                >
                  Закрыть
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {preview.loading && !preview.nodes ? (
                <p className="text-sand">Строим общее древо…</p>
              ) : preview.nodes && preview.nodes.length > 0 ? (
                <div className="rounded-xl border border-line bg-gold/[0.03] p-2">
                  <TreeView
                    people={fullTreeToPeople(preview.nodes)}
                    selectedId={preview.selectedId}
                    onSelect={(id) =>
                      setPreview((prev) =>
                        prev ? { ...prev, selectedId: id } : prev,
                      )
                    }
                  />
                </div>
              ) : (
                <p className="text-sand">Построить схему не удалось.</p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/** Склонение слова «человек» по числу. */
function personWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "человек";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20))
    return "человека";
  return "человек";
}

/** Очередь правок опубликованных записей: старые данные публичны, новые ждут одобрения. */
function EditQueue() {
  const [owners, setOwners] = useState<PendingTree[]>([]);
  const [changes, setChanges] = useState<Record<number, TreeChange[]>>({});
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const os = await api.moderation.editOwners();
      setOwners(os);
      const map: Record<number, TreeChange[]> = {};
      await Promise.all(
        os.map((o) =>
          api.moderation
            .changes(o.owner_id)
            .then((c) => {
              map[o.owner_id] = c;
            })
            .catch(() => undefined),
        ),
      );
      setChanges(map);
    } catch {
      setOwners([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(personId: number, action: "approveEdit" | "rejectEdit") {
    setBusy(personId);
    try {
      await api.moderation[action](personId);
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (owners.length === 0) return null;

  return (
    <div className="mt-6 border-t border-line pt-4">
      <h3 className="m-0 mb-3 text-lg font-semibold text-cream">
        Правки опубликованных записей
      </h3>
      <div className="flex flex-col gap-3">
        {owners.map((o) =>
          (changes[o.owner_id] ?? []).map((c) => (
            <div
              key={c.person_id}
              className="rounded-xl border border-line p-3"
            >
              <p className="m-0 text-[14px] font-bold text-gold-light">
                {c.full_name}
              </p>
              <span className="text-[12px] text-sand">{o.owner_name}</span>
              <ul className="m-0 mt-1.5 list-disc pl-5 text-[13px] text-sand">
                {Object.entries(c.diff).map(([field, v]) => (
                  <li key={field}>
                    {FIELD_RU[field] ?? field}: <s>{String(v.from ?? "—")}</s> →{" "}
                    <span className="text-cream">{String(v.to ?? "—")}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className={`${BTN_PRIMARY} !px-3 !py-1 !text-[13px]`}
                  disabled={busy === c.person_id}
                  onClick={() => void act(c.person_id, "approveEdit")}
                >
                  ✓ Применить
                </button>
                <button
                  type="button"
                  className={`${LINK_DANGER}`}
                  disabled={busy === c.person_id}
                  onClick={() => void act(c.person_id, "rejectEdit")}
                >
                  ✖ Отклонить
                </button>
              </div>
            </div>
          )),
        )}
      </div>
    </div>
  );
}
