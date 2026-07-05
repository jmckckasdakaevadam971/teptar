"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
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

// ============================================================================
//  Вспомогательные функции
// ============================================================================

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

/** Годы жизни человека одной строкой. */
function anchorYears(birth: number | null, death: number | null): string {
  return birth || death
    ? `${birth ?? "?"} – ${death ?? "?"}`
    : "годы не указаны";
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
    spouseNames: p.spouse_names ?? undefined,
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

/** Предложение уже неактуально (слито/пересоздано/персона удалена). */
function isStale(e: unknown): boolean {
  const status = (e as { status?: number } | null)?.status;
  const msg = e instanceof Error ? e.message.toLowerCase() : "";
  return status === 404 || msg.includes("не найдено");
}

/** «Только что», «5 мин назад», «2 ч назад» — для обработанных заявок. */
function timeAgo(ts: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 60) return "только что";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  return `${h} ч назад`;
}

// ============================================================================
//  Модель единой ленты заявок
// ============================================================================

type FeedKind = "tree" | "suggestion" | "merge" | "edit";

type FeedItem =
  | { kind: "tree"; key: string; tree: PendingTree }
  | { kind: "suggestion"; key: string; s: MergeSuggestion }
  | { kind: "merge"; key: string; m: TreeMerge }
  | { kind: "edit"; key: string; ownerName: string; change: TreeChange };

/** Итог обработки — для чипа статуса. */
type DoneStatus = "approved" | "rejected" | "merged" | "dismissed";

interface HistoryEntry {
  item: FeedItem;
  status: DoneStatus;
  at: number;
}

const KIND_LABEL: Record<FeedKind, string> = {
  tree: "Публикация древа",
  suggestion: "Объединение древ",
  merge: "Общее древо",
  edit: "Данные человека",
};

const DONE_LABEL: Record<DoneStatus, string> = {
  approved: "Одобрено",
  rejected: "Отклонено",
  merged: "Объединено",
  dismissed: "Не совпадают",
};

/** Заголовок карточки в ленте. */
function itemTitle(item: FeedItem): string {
  switch (item.kind) {
    case "tree":
      return `Древо — ${item.tree.owner_name}`;
    case "suggestion":
      return `Общий предок: ${item.s.anchor_a.full_name}`;
    case "merge":
      return item.m.merged_name;
    case "edit":
      return `${item.change.full_name} — правка данных`;
  }
}

/** Строка с автором и краткой сводкой. */
function itemMeta(item: FeedItem): string {
  switch (item.kind) {
    case "tree":
      return `${item.tree.owner_name} · ${item.tree.count} ${personWord(item.tree.count)} · ${yearsLabel(item.tree.min_year, item.tree.max_year)}`;
    case "suggestion":
      return `${item.s.owner_a.owner_name ?? "—"} ⇄ ${item.s.owner_b.owner_name ?? "—"} · совпадение ~${Math.round(item.s.similarity * 100)}%`;
    case "merge":
      return `${item.m.total} ${personWord(item.m.total)} · ${item.m.branch_a.owner_name ?? "—"} + ${item.m.branch_b.owner_name ?? "—"}`;
    case "edit": {
      const n = Object.keys(item.change.diff).length;
      return `${item.ownerName} · изменений: ${n}`;
    }
  }
}

// ============================================================================
//  Мелкие UI-элементы
// ============================================================================

/** Ключ localStorage: показывать ли блок «Как работает модерация». */
const GUIDE_KEY = "vorhda_moderation_guide";

/** Иконка типа заявки в круге. */
function KindIcon({ kind }: { kind: FeedKind }) {
  const glyph =
    kind === "tree" ? "🌳" : kind === "suggestion" ? "⇄" : kind === "merge" ? "🔗" : "✎";
  return (
    <span
      aria-hidden
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold-soft bg-gold/10 text-[15px] text-gold-light"
    >
      {glyph}
    </span>
  );
}

/** Чип статуса заявки. */
function StatusChip({ status }: { status: "pending" | DoneStatus }) {
  if (status === "pending") {
    return (
      <span className="rounded-full border border-gold-soft bg-gold/10 px-2 py-0.5 text-[11px] font-semibold text-gold-light">
        Ждёт решения
      </span>
    );
  }
  const good = status === "approved" || status === "merged";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
        good
          ? "border-success-border bg-success-bg text-success"
          : "border-danger-border bg-danger-bg text-danger"
      }`}
    >
      {DONE_LABEL[status]}
    </span>
  );
}

/** Стрелка раскрытия карточки. */
function Chevron({ open }: { open: boolean }) {
  return (
    <span
      aria-hidden
      className={`text-sand transition-transform ${open ? "rotate-180" : ""}`}
    >
      ⌄
    </span>
  );
}

/** Оранжевый чип «Возможный дубликат» на карточке древа в очереди. */
function DuplicateChip() {
  return (
    <span className="rounded-full border border-warning-border bg-warning-bg px-2 py-0.5 text-[11px] font-semibold text-warning">
      ⚠ Возможный дубликат
    </span>
  );
}

/** Плашка «label: value» в раскрытой карточке. */
function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-background/40 px-3 py-2">
      <div className="text-[11px] text-sand">{label}</div>
      <div className="mt-0.5 text-[14px] text-cream">{value}</div>
    </div>
  );
}

// ============================================================================
//  Блок «Как работает модерация — 3 шага» (сворачиваемый)
// ============================================================================

function HowItWorks({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  const steps = [
    {
      title: "Откройте заявку",
      text: "Нажмите на карточку в очереди — внутри сводка изменений и данные автора.",
    },
    {
      title: "Проверьте по чек-листу",
      text: "Даты не противоречат друг другу, имена реальные, тейп указан верно.",
    },
    {
      title: "Примите решение",
      text: "«Одобрить» — данные попадут в общую базу. «Отклонить» — заявка вернётся автору, он получит письмо.",
    },
  ];
  return (
    <div className="mb-4 rounded-xl border border-gold-soft bg-gold/[0.04]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 font-serif text-[15px] font-bold text-cream">
          <span aria-hidden className="text-gold-light">
            ✓
          </span>
          Как работает модерация — 3 шага
        </span>
        <Chevron open={open} />
      </button>
      {open && (
        <div className="grid gap-4 border-t border-gold-soft/40 px-4 py-4 sm:grid-cols-3">
          {steps.map((s, i) => (
            <div key={s.title} className="flex gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold text-[12px] font-bold text-background">
                {i + 1}
              </span>
              <div>
                <p className="m-0 text-[14px] font-semibold text-cream">
                  {s.title}
                </p>
                <p className="m-0 mt-0.5 text-[12.5px] leading-relaxed text-sand">
                  {s.text}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
//  Правая колонка: чек-лист и расшифровка решений
// ============================================================================

function Checklist() {
  const items = [
    "Даты рождения и смерти не противоречат поколениям",
    "Имена реальные, без ошибок и посторонних символов",
    "Нет оскорблений и непроверяемых утверждений",
    "Тейп и село соответствуют справочнику",
    "При объединении древ: это точно один человек (отец и годы совпадают)",
  ];
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <p className="m-0 mb-3 flex items-center gap-2 font-serif text-[16px] font-bold text-cream">
        <span aria-hidden className="text-gold-light">
          ☰
        </span>
        Чек-лист проверки
      </p>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {items.map((t) => (
          <li key={t} className="flex gap-2 text-[13px] leading-snug text-sand">
            <span aria-hidden className="mt-px shrink-0 text-gold-light">
              ✓
            </span>
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DecisionsHelp() {
  const items = [
    {
      icon: "✓",
      title: "Одобрить",
      text: "Данные сразу появятся в общей базе и станут видны всем.",
    },
    {
      icon: "↩",
      title: "Отклонить",
      text: "Заявка вернётся автору: он сможет исправить и отправить снова. Автор получит письмо.",
    },
    {
      icon: "⇄",
      title: "Не совпадают",
      text: "Для объединений: пометить, что это разные люди — предложение больше не появится.",
    },
  ];
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <p className="m-0 mb-3 font-serif text-[16px] font-bold text-cream">
        Что означают решения
      </p>
      <div className="flex flex-col gap-3">
        {items.map((d) => (
          <div key={d.title}>
            <p className="m-0 flex items-center gap-1.5 text-[13px] font-semibold text-cream">
              <span aria-hidden className="text-gold-light">
                {d.icon}
              </span>
              {d.title}
            </p>
            <p className="m-0 mt-0.5 text-[12.5px] leading-relaxed text-sand">
              {d.text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
//  Тела карточек по типам заявок
// ============================================================================

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

/** Быстрые варианты причин отклонения — автор увидит текст в письме. */
const REJECT_PRESETS = [
  "Не хватает данных: у многих людей не указаны годы жизни или тейп.",
  "Есть ошибки в именах или датах — проверьте написание.",
  "Похоже на дубликат уже опубликованного древа.",
  "Слишком мало людей: добавьте хотя бы 2–3 поколения.",
] as const;

/**
 * Форма отклонения древа: быстрые причины (чипы) + свой комментарий.
 * Итоговый текст уходит автору в письмо и сохраняется в журнале модерации.
 */
function RejectTreeForm({
  busy,
  onReject,
  onCancel,
}: {
  busy: boolean;
  onReject: (reason?: string) => void;
  onCancel: () => void;
}) {
  const [preset, setPreset] = useState<string | null>(null);
  const [custom, setCustom] = useState("");

  const reason = [preset, custom.trim()].filter(Boolean).join("\n");

  return (
    <div className="mt-3 w-full rounded-xl border border-danger-strong/40 bg-danger-strong/[0.06] p-3">
      <p className="m-0 mb-2 text-[13px] font-semibold text-cream">
        Почему отклоняете? Выберите причину или напишите свою — автор увидит её
        в письме.
      </p>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {REJECT_PRESETS.map((p) => {
          const active = preset === p;
          return (
            <button
              key={p}
              type="button"
              disabled={busy}
              onClick={() => setPreset(active ? null : p)}
              className={`cursor-pointer rounded-full border px-3 py-1 text-left text-[12px] leading-snug transition-colors ${
                active
                  ? "border-gold bg-gold/15 text-gold-light"
                  : "border-line bg-transparent text-sand hover:border-gold/50 hover:text-cream"
              }`}
            >
              {p}
            </button>
          );
        })}
      </div>
      <textarea
        value={custom}
        onChange={(e) => setCustom(e.target.value)}
        maxLength={500}
        rows={2}
        disabled={busy}
        placeholder="Свой комментарий автору (необязательно)…"
        className="mb-2 w-full resize-y rounded-lg border border-line bg-transparent px-3 py-2 text-[13px] text-cream outline-none transition-colors placeholder:text-sand/60 focus:border-gold/60"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-danger-strong px-3 py-1.5 text-[13px] font-semibold text-danger-strong-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={busy}
          onClick={() => onReject(reason || undefined)}
        >
          ✖ Отклонить{reason ? " с комментарием" : " без комментария"}
        </button>
        <button
          type="button"
          className={`${BTN_SECONDARY} !px-3 !py-1.5 !text-[13px]`}
          disabled={busy}
          onClick={onCancel}
        >
          Отмена
        </button>
      </div>
      {!reason && (
        <p className="m-0 mt-2 text-[12px] text-sand">
          Комментарий необязателен, но с ним автору будет проще исправить древо.
        </p>
      )}
    </div>
  );
}

/** Раскрытая карточка «Публикация древа». */
function TreeBody({
  tree,
  busy,
  onView,
  onApprove,
  onReject,
}: {
  tree: PendingTree;
  busy: boolean;
  onView: () => void;
  onApprove: () => void;
  onReject: (reason?: string) => void;
}) {
  const [confirmReject, setConfirmReject] = useState(false);
  return (
    <div>
      <p className="m-0 mb-3 text-[13px] leading-relaxed text-sand">
        Автор отправил древо в общую базу. Откройте схему, проверьте имена и
        годы по чек-листу и примите решение.
      </p>
      {tree.duplicate && (
        <div className="mb-3 rounded-xl border border-warning-border bg-warning/[0.07] px-3 py-2.5">
          <p className="m-0 text-[13px] font-semibold text-warning">
            ⚠ Похоже на дубликат древа «{tree.duplicate.owner_name}»
          </p>
          <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-sand">
            Совпало {tree.duplicate.matched} из {tree.count}{" "}
            {personWord(tree.count)} (имя, тейп, год рождения).{" "}
            {tree.duplicate.published
              ? "То древо уже опубликовано в общей базе."
              : "То древо тоже ждёт модерации."}{" "}
            Откройте схему и сравните: если это одно и то же древо — отклоните
            с причиной «дубликат»; если это родственники — используйте
            «Объединение древ».
          </p>
        </div>
      )}
      <div className="mb-3 grid grid-cols-2 gap-2">
        <StatBox
          label="Человек в древе"
          value={`${tree.count} ${personWord(tree.count)}`}
        />
        <StatBox label="Годы" value={yearsLabel(tree.min_year, tree.max_year)} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`${BTN_SECONDARY} !px-3 !py-1.5 !text-[13px]`}
          disabled={busy}
          onClick={onView}
        >
          Просмотреть древо
        </button>
        <button
          type="button"
          className={`${BTN_PRIMARY} !px-3 !py-1.5 !text-[13px]`}
          disabled={busy}
          onClick={onApprove}
        >
          ✓ Одобрить
        </button>
        {!confirmReject && (
          <button
            type="button"
            className={LINK_DANGER}
            disabled={busy}
            onClick={() => setConfirmReject(true)}
          >
            ✖ Отклонить
          </button>
        )}
      </div>
      {confirmReject && (
        <RejectTreeForm
          busy={busy}
          onReject={onReject}
          onCancel={() => setConfirmReject(false)}
        />
      )}
    </div>
  );
}

/** Раскрытая карточка «Объединение древ»: схемы якорей + форма объединения. */
function SuggestionBody({
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
    <div>
      <p className="m-0 mb-2 text-[13px] leading-relaxed text-sand">
        Ваш вопрос здесь один:{" "}
        <b className="text-cream">это один и тот же человек?</b> Да —
        объедините: создастся общее древо, исходные не меняются. Нет — «Не
        совпадают».
      </p>

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

/** Раскрытая карточка «Общее древо на проверке». */
function MergeBody({
  m,
  busy,
  onPreview,
  onApprove,
  onReject,
}: {
  m: TreeMerge;
  busy: boolean;
  onPreview: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [confirmReject, setConfirmReject] = useState(false);
  return (
    <div>
      <p className="m-0 mb-3 text-[13px] leading-relaxed text-sand">
        Финальная проверка: общее древо уже собрано из двух веток. Убедитесь,
        что ветки срослись правильно и нет двойников, затем одобрите — древо
        появится у всех в разделе «Древа». Исходные древа авторов не меняются.
      </p>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatBox
          label="Общий предок"
          value={`${m.merged_name}${m.merged_birth_year != null ? ` (${m.merged_birth_year}${m.merged_death_year != null ? `–${m.merged_death_year}` : ""})` : ""}`}
        />
        <StatBox
          label={`Ветка A — ${m.branch_a.owner_name ?? "—"}`}
          value={`${m.branch_a.size} ${personWord(m.branch_a.size)}`}
        />
        <StatBox
          label={`Ветка B — ${m.branch_b.owner_name ?? "—"}`}
          value={`${m.branch_b.size} ${personWord(m.branch_b.size)}`}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`${BTN_SECONDARY} !px-3 !py-1.5 !text-[13px]`}
          disabled={busy}
          onClick={onPreview}
        >
          Показать древо
        </button>
        <button
          type="button"
          className={`${BTN_PRIMARY} !px-3 !py-1.5 !text-[13px]`}
          disabled={busy}
          onClick={onApprove}
        >
          ✓ Одобрить и опубликовать
        </button>
        {confirmReject ? (
          <span className="flex items-center gap-2 text-[13px] text-sand">
            Точно отклонить?
            <button
              type="button"
              className={LINK_DANGER}
              disabled={busy}
              onClick={onReject}
            >
              Да
            </button>
            <button
              type="button"
              className={BTN_SECONDARY}
              disabled={busy}
              onClick={() => setConfirmReject(false)}
            >
              Отмена
            </button>
          </span>
        ) : (
          <button
            type="button"
            className={LINK_DANGER}
            disabled={busy}
            onClick={() => setConfirmReject(true)}
          >
            ✖ Отклонить
          </button>
        )}
      </div>
    </div>
  );
}

/** Раскрытая карточка «Данные человека» (правка опубликованной записи). */
function EditBody({
  change,
  busy,
  onApprove,
  onReject,
}: {
  change: TreeChange;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div>
      <p className="m-0 mb-2 text-[13px] leading-relaxed text-sand">
        Запись уже опубликована — все видят старые данные, пока вы не примете
        правку. Зачёркнуто — как было, рядом — как станет.
      </p>
      <ul className="m-0 mb-3 list-disc pl-5 text-[13px] text-sand">
        {Object.entries(change.diff).map(([field, v]) => (
          <li key={field}>
            {FIELD_RU[field] ?? field}: <s>{String(v.from ?? "—")}</s> →{" "}
            <span className="text-cream">{String(v.to ?? "—")}</span>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button
          type="button"
          className={`${BTN_PRIMARY} !px-3 !py-1 !text-[13px]`}
          disabled={busy}
          onClick={onApprove}
        >
          ✓ Применить
        </button>
        <button
          type="button"
          className={LINK_DANGER}
          disabled={busy}
          onClick={onReject}
        >
          ✖ Отклонить
        </button>
      </div>
    </div>
  );
}

// ============================================================================
//  Главная панель модерации: единая лента + фильтры + правая колонка
// ============================================================================

export function ModerationPanel() {
  const { user } = useAuth();
  const [trees, setTrees] = useState<PendingTree[]>([]);
  const [suggestions, setSuggestions] = useState<MergeSuggestion[]>([]);
  const [merges, setMerges] = useState<TreeMerge[]>([]);
  const [edits, setEdits] = useState<{ owner: PendingTree; change: TreeChange }[]>([]);
  const [myTeips, setMyTeips] = useState<{ id: number; name: string }[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "done" | "all">("pending");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [mounted, setMounted] = useState(false);

  // Блок «Как работает» — по умолчанию раскрыт, выбор запоминается.
  const [guideOpen, setGuideOpen] = useState(false);
  useEffect(() => {
    setMounted(true);
    try {
      setGuideOpen(localStorage.getItem(GUIDE_KEY) !== "hidden");
    } catch {
      setGuideOpen(true);
    }
  }, []);

  function toggleGuide() {
    const next = !guideOpen;
    setGuideOpen(next);
    try {
      localStorage.setItem(GUIDE_KEY, next ? "shown" : "hidden");
    } catch {
      /* приватный режим — не запоминаем */
    }
  }

  // Полноэкранный просмотр древа автора (для заявок «Публикация древа»).
  const [viewer, setViewer] = useState<{
    tree: PendingTree;
    persons: Person[] | null;
    dups: DuplicatePair[];
    loading: boolean;
    selectedId: string | null;
    confirmReject: boolean;
  } | null>(null);

  // Полноэкранный просмотр общего древа (для объединений).
  const [mergePreview, setMergePreview] = useState<{
    mergeId: number;
    title: string;
    subtitle: string;
    approveId: number | null; // если задан — в шапке есть кнопка «Одобрить»
    nodes: TreeNode[] | null;
    loading: boolean;
    selectedId: string | null;
  } | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ts, ss, ms, editOwners] = await Promise.all([
        api.moderation.pending(),
        api.moderation.mergeSuggestions().catch(() => [] as MergeSuggestion[]),
        api.moderation.pendingMerges().catch(() => [] as TreeMerge[]),
        api.moderation.editOwners().catch(() => [] as PendingTree[]),
      ]);
      setTrees(ts);
      setSuggestions(ss);
      setMerges(ms);
      const pairs: { owner: PendingTree; change: TreeChange }[] = [];
      await Promise.all(
        editOwners.map((o) =>
          api.moderation
            .changes(o.owner_id)
            .then((cs) => {
              for (const c of cs) pairs.push({ owner: o, change: c });
            })
            .catch(() => undefined),
        ),
      );
      setEdits(pairs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Тейпы, закреплённые за хранителем — он видит заявки только по ним.
  useEffect(() => {
    if (user?.role !== "teip_admin") return;
    api.keepers
      .my()
      .then((st) => setMyTeips(st.teips))
      .catch(() => undefined);
  }, [user?.role]);

  // ---------- лента ----------

  const pendingItems: FeedItem[] = useMemo(() => {
    const list: FeedItem[] = [];
    for (const t of trees)
      list.push({ kind: "tree", key: `tree-${t.owner_id}`, tree: t });
    for (const s of suggestions)
      list.push({ kind: "suggestion", key: `sug-${s.id}`, s });
    for (const m of merges)
      list.push({ kind: "merge", key: `merge-${m.id}`, m });
    for (const e of edits)
      list.push({
        kind: "edit",
        key: `edit-${e.change.person_id}`,
        ownerName: e.owner.owner_name,
        change: e.change,
      });
    return list;
  }, [trees, suggestions, merges, edits]);

  const doneCount = history.length;
  const allCount = pendingItems.length + doneCount;

  /** Пометить заявку обработанной (уходит во вкладку «Обработанные»). */
  function finish(item: FeedItem, status: DoneStatus) {
    setHistory((prev) => [{ item, status, at: Date.now() }, ...prev]);
    setExpandedKey(null);
  }

  // ---------- действия ----------

  async function decideTree(
    item: Extract<FeedItem, { kind: "tree" }>,
    action: "approve" | "reject",
    reason?: string,
  ) {
    setBusyKey(item.key);
    setError(null);
    try {
      if (action === "approve") await api.moderation.approve(item.tree.owner_id);
      else await api.moderation.reject(item.tree.owner_id, reason);
      setTrees((prev) => prev.filter((t) => t.owner_id !== item.tree.owner_id));
      finish(item, action === "approve" ? "approved" : "rejected");
      if (viewer?.tree.owner_id === item.tree.owner_id) setViewer(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось выполнить действие");
    } finally {
      setBusyKey(null);
    }
  }

  async function openTreeViewer(tree: PendingTree) {
    setViewer({
      tree,
      persons: null,
      dups: [],
      loading: true,
      selectedId: null,
      confirmReject: false,
    });
    try {
      const [persons, dups] = await Promise.all([
        api.moderation.persons(tree.owner_id),
        api.moderation.duplicates(tree.owner_id).catch(() => [] as DuplicatePair[]),
      ]);
      setViewer((prev) =>
        prev && prev.tree.owner_id === tree.owner_id
          ? { ...prev, persons, dups, loading: false }
          : prev,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить древо");
      setViewer(null);
    }
  }

  /** Объединить дубли внутри просматриваемого древа: keep остаётся, drop удаляется. */
  async function mergeDuplicate(ownerId: number, keepId: number, dropId: number) {
    if (!confirm("Объединить эти две записи? Действие необратимо.")) return;
    setBusyKey(`tree-${ownerId}`);
    setError(null);
    try {
      await api.moderation.merge(keepId, dropId);
      const [persons, dups] = await Promise.all([
        api.moderation.persons(ownerId),
        api.moderation.duplicates(ownerId).catch(() => [] as DuplicatePair[]),
      ]);
      setViewer((prev) =>
        prev && prev.tree.owner_id === ownerId
          ? { ...prev, persons, dups }
          : prev,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось объединить");
    } finally {
      setBusyKey(null);
    }
  }

  async function openMergedPreview(
    mergeId: number,
    opts: { title: string; subtitle: string; approveId: number | null },
  ) {
    setMergePreview({
      mergeId,
      ...opts,
      nodes: null,
      loading: true,
      selectedId: null,
    });
    try {
      const nodes = await api.tree.mergedTree(mergeId);
      setMergePreview((prev) =>
        prev && prev.mergeId === mergeId
          ? { ...prev, nodes, loading: false }
          : prev,
      );
    } catch {
      setMergePreview((prev) =>
        prev && prev.mergeId === mergeId
          ? { ...prev, nodes: [], loading: false }
          : prev,
      );
    }
  }

  async function resolveSuggestion(
    item: Extract<FeedItem, { kind: "suggestion" }>,
    keepId: number,
    fields: {
      full_name: string;
      birth_year: number | null;
      death_year: number | null;
      note: string | null;
    },
  ) {
    setBusyKey(item.key);
    setError(null);
    try {
      const res = await api.moderation.resolveMerge(item.s.id, keepId, fields);
      setSuggestions((prev) => prev.filter((x) => x.id !== item.s.id));
      finish(item, "merged");
      // Появилось новое общее древо на проверке — обновим и покажем его.
      try {
        setMerges(await api.moderation.pendingMerges());
      } catch {
        /* не критично */
      }
      void openMergedPreview(res.tree_merge_id, {
        title: "Общее древо отправлено на проверку",
        subtitle:
          "Так оно будет выглядеть. Найдите его в очереди «Общее древо» и одобрите после проверки.",
        approveId: null,
      });
    } catch (e) {
      if (isStale(e)) {
        setSuggestions((prev) => prev.filter((x) => x.id !== item.s.id));
        setError("Это предложение уже неактуально (древо изменилось). Список обновлён.");
        void loadAll();
      } else {
        setError(e instanceof Error ? e.message : "Не удалось объединить");
      }
    } finally {
      setBusyKey(null);
    }
  }

  async function dismissSuggestion(item: Extract<FeedItem, { kind: "suggestion" }>) {
    setBusyKey(item.key);
    setError(null);
    try {
      await api.moderation.dismissMerge(item.s.id);
      setSuggestions((prev) => prev.filter((x) => x.id !== item.s.id));
      finish(item, "dismissed");
    } catch (e) {
      if (isStale(e)) {
        setSuggestions((prev) => prev.filter((x) => x.id !== item.s.id));
        setError("Это предложение уже неактуально. Список обновлён.");
        void loadAll();
      } else {
        setError(e instanceof Error ? e.message : "Не удалось отклонить");
      }
    } finally {
      setBusyKey(null);
    }
  }

  async function decideMerge(
    item: Extract<FeedItem, { kind: "merge" }>,
    action: "approveMerge" | "rejectMerge",
  ) {
    setBusyKey(item.key);
    setError(null);
    try {
      await api.moderation[action](item.m.id);
      setMerges((prev) => prev.filter((x) => x.id !== item.m.id));
      finish(item, action === "approveMerge" ? "approved" : "rejected");
      if (mergePreview?.mergeId === item.m.id) setMergePreview(null);
    } catch (e) {
      if (isStale(e)) {
        setMerges((prev) => prev.filter((x) => x.id !== item.m.id));
        setError("Это объединение уже неактуально. Список обновлён.");
        void loadAll();
      } else {
        setError(e instanceof Error ? e.message : "Не удалось выполнить");
      }
    } finally {
      setBusyKey(null);
    }
  }

  async function decideEdit(
    item: Extract<FeedItem, { kind: "edit" }>,
    action: "approveEdit" | "rejectEdit",
  ) {
    setBusyKey(item.key);
    setError(null);
    try {
      await api.moderation[action](item.change.person_id);
      setEdits((prev) =>
        prev.filter((e) => e.change.person_id !== item.change.person_id),
      );
      finish(item, action === "approveEdit" ? "approved" : "rejected");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось выполнить");
    } finally {
      setBusyKey(null);
    }
  }

  // ---------- рендер карточки ----------

  function renderBody(item: FeedItem) {
    const busy = busyKey === item.key;
    switch (item.kind) {
      case "tree":
        return (
          <TreeBody
            tree={item.tree}
            busy={busy}
            onView={() => void openTreeViewer(item.tree)}
            onApprove={() => void decideTree(item, "approve")}
            onReject={(reason) => void decideTree(item, "reject", reason)}
          />
        );
      case "suggestion":
        return (
          <SuggestionBody
            s={item.s}
            busy={busy}
            onMerge={(keepId, fields) =>
              void resolveSuggestion(item, keepId, fields)
            }
            onDismiss={() => void dismissSuggestion(item)}
          />
        );
      case "merge":
        return (
          <MergeBody
            m={item.m}
            busy={busy}
            onPreview={() =>
              void openMergedPreview(item.m.id, {
                title: "Общее древо (на проверке)",
                subtitle: "Проверьте целиком, затем одобрите или отклоните.",
                approveId: item.m.id,
              })
            }
            onApprove={() => void decideMerge(item, "approveMerge")}
            onReject={() => void decideMerge(item, "rejectMerge")}
          />
        );
      case "edit":
        return (
          <EditBody
            change={item.change}
            busy={busy}
            onApprove={() => void decideEdit(item, "approveEdit")}
            onReject={() => void decideEdit(item, "rejectEdit")}
          />
        );
    }
  }

  function FeedCardShell({
    item,
    status,
    at,
  }: {
    item: FeedItem;
    status: "pending" | DoneStatus;
    at?: number;
  }) {
    const isPending = status === "pending";
    const open = isPending && expandedKey === item.key;
    return (
      <div
        className={`rounded-xl border transition-colors ${
          open ? "border-gold-soft bg-gold/[0.04]" : "border-line bg-gold/[0.02]"
        }`}
      >
        <button
          type="button"
          onClick={() =>
            isPending && setExpandedKey(open ? null : item.key)
          }
          className={`flex w-full items-start gap-3 px-3.5 py-3 text-left ${isPending ? "" : "cursor-default"}`}
        >
          <KindIcon kind={item.kind} />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] uppercase tracking-wider text-sand">
                {KIND_LABEL[item.kind]}
              </span>
              <StatusChip status={status} />
              {isPending && item.kind === "tree" && item.tree.duplicate && (
                <DuplicateChip />
              )}
            </span>
            <span className="mt-0.5 block truncate font-serif text-[16px] font-bold text-cream">
              {itemTitle(item)}
            </span>
            <span className="mt-0.5 block text-[12.5px] text-sand">
              {itemMeta(item)}
              {at != null && ` · ${timeAgo(at)}`}
            </span>
          </span>
          {isPending && <Chevron open={open} />}
        </button>
        {open && (
          <div className="border-t border-line px-3.5 py-3">
            {renderBody(item)}
          </div>
        )}
      </div>
    );
  }

  // ---------- вкладки ----------

  const tabs: { id: typeof filter; label: string; count: number }[] = [
    { id: "pending", label: "Ждут решения", count: pendingItems.length },
    { id: "done", label: "Обработанные", count: doneCount },
    { id: "all", label: "Все", count: allCount },
  ];

  return (
    <div className={CARD}>
      <HowItWorks open={guideOpen} onToggle={toggleGuide} />

      {user?.role === "teip_admin" && myTeips.length > 0 && (
        <p className="mb-4 flex flex-wrap items-center gap-1.5 text-[13px] text-sand">
          <span>Ваши тейпы:</span>
          {myTeips.map((t) => (
            <span
              key={t.id}
              className="rounded-full bg-gold/10 px-2.5 py-0.5 font-medium text-gold-light"
            >
              {t.name}
            </span>
          ))}
          <span>— вы видите заявки только по ним.</span>
        </p>
      )}

      <div className="gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_280px]">
        {/* -------- Лента заявок -------- */}
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setFilter(t.id)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors ${
                    filter === t.id
                      ? "border-gold-soft bg-gold/10 font-semibold text-gold-light"
                      : "border-line text-sand hover:border-gold-soft/60"
                  }`}
                >
                  {t.label}
                  <span
                    className={`rounded-full px-1.5 text-[11px] leading-[18px] ${
                      filter === t.id
                        ? "bg-gold/20 text-gold-light"
                        : "bg-background/60 text-sand"
                    }`}
                  >
                    {t.count}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className={BTN_SECONDARY}
              onClick={() => void loadAll()}
              disabled={loading}
            >
              Обновить
            </button>
          </div>

          {error && <p className="mb-2 text-sm text-danger-strong">{error}</p>}

          {loading ? (
            <p className="text-sand">Загрузка…</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {(filter === "pending" || filter === "all") &&
                pendingItems.map((item) => (
                  <FeedCardShell key={item.key} item={item} status="pending" />
                ))}
              {(filter === "done" || filter === "all") &&
                history.map((h) => (
                  <FeedCardShell
                    key={`done-${h.item.key}-${h.at}`}
                    item={h.item}
                    status={h.status}
                    at={h.at}
                  />
                ))}

              {filter === "pending" && pendingItems.length === 0 && (
                <p className="m-0 rounded-xl border border-line px-4 py-6 text-center text-sand">
                  ✓ Всё проверено — заявок нет. Новые появятся здесь, когда
                  авторы отправят древа или правки.
                </p>
              )}
              {filter === "done" && doneCount === 0 && (
                <p className="m-0 rounded-xl border border-line px-4 py-6 text-center text-sand">
                  Здесь появятся заявки, обработанные в этой сессии.
                </p>
              )}
              {filter === "all" && allCount === 0 && (
                <p className="m-0 rounded-xl border border-line px-4 py-6 text-center text-sand">
                  Заявок пока нет.
                </p>
              )}
            </div>
          )}
        </div>

        {/* -------- Правая колонка -------- */}
        <div className="mt-5 flex flex-col gap-4 lg:mt-0">
          <Checklist />
          <DecisionsHelp />
        </div>
      </div>

      {/* -------- Полноэкранный просмотр древа автора -------- */}
      {mounted &&
        viewer &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex flex-col bg-background">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div className="flex min-w-[200px] items-center gap-2.5">
                <button
                  type="button"
                  className={BTN_SECONDARY}
                  onClick={() => setViewer(null)}
                >
                  ← Назад
                </button>
                <span className="text-[16px] font-bold text-gold-light">
                  {viewer.tree.owner_name}
                </span>
                <span className="text-[13px] text-sand">
                  {viewer.tree.count} {personWord(viewer.tree.count)} ·{" "}
                  {yearsLabel(viewer.tree.min_year, viewer.tree.max_year)}
                </span>
                {viewer.tree.duplicate && <DuplicateChip />}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={BTN_PRIMARY}
                  disabled={busyKey === `tree-${viewer.tree.owner_id}`}
                  onClick={() =>
                    void decideTree(
                      {
                        kind: "tree",
                        key: `tree-${viewer.tree.owner_id}`,
                        tree: viewer.tree,
                      },
                      "approve",
                    )
                  }
                >
                  ✓ Одобрить
                </button>
                <button
                  type="button"
                  className={LINK_DANGER}
                  onClick={() =>
                    setViewer((prev) =>
                      prev
                        ? { ...prev, confirmReject: !prev.confirmReject }
                        : prev,
                    )
                  }
                >
                  ✖ Отклонить
                </button>
              </div>
            </div>

            {/* Панель выбора причины отклонения — под шапкой. */}
            {viewer.confirmReject && (
              <div className="border-b border-line px-4 pb-3">
                <RejectTreeForm
                  busy={busyKey === `tree-${viewer.tree.owner_id}`}
                  onReject={(reason) =>
                    void decideTree(
                      {
                        kind: "tree",
                        key: `tree-${viewer.tree.owner_id}`,
                        tree: viewer.tree,
                      },
                      "reject",
                      reason,
                    )
                  }
                  onCancel={() =>
                    setViewer((prev) =>
                      prev ? { ...prev, confirmReject: false } : prev,
                    )
                  }
                />
              </div>
            )}

            <div className="flex-1 overflow-auto p-4">
              {error && <p className="mb-3 text-sm text-danger-strong">{error}</p>}
              {viewer.loading ? (
                <p className="text-sand">Загрузка древа…</p>
              ) : viewer.persons && viewer.persons.length > 0 ? (
                <>
                  <div className="rounded-xl border border-line bg-gold/[0.03] p-2">
                    <TreeView
                      people={toTreePeople(viewer.persons)}
                      selectedId={viewer.selectedId}
                      onSelect={(id) =>
                        setViewer((prev) =>
                          prev ? { ...prev, selectedId: id } : prev,
                        )
                      }
                    />
                  </div>

                  <div className="mt-4">
                    <span className="text-[13px] text-sand">
                      Персоны древа ({viewer.persons.length})
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
                          {viewer.persons.map((p) => (
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

                  {viewer.dups.length > 0 && (
                    <div className="mt-4 rounded-lg border border-gold-soft bg-gold/[0.06] p-3">
                      <p className="m-0 mb-2 text-[13px] font-bold text-gold-light">
                        ⚠ Возможные совпадения с другими древами (
                        {viewer.dups.length})
                      </p>
                      <div className="flex flex-col gap-2">
                        {viewer.dups.map((d, i) => (
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
                                {d.candidate.owner_name ?? "другой автор"} · ~
                                {Math.round(d.candidate.similarity * 100)}%
                              </span>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className={`${BTN_SECONDARY} !px-2.5 !py-1 !text-[12px]`}
                                disabled={
                                  busyKey === `tree-${viewer.tree.owner_id}`
                                }
                                onClick={() =>
                                  void mergeDuplicate(
                                    viewer.tree.owner_id,
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
                                disabled={
                                  busyKey === `tree-${viewer.tree.owner_id}`
                                }
                                onClick={() =>
                                  void mergeDuplicate(
                                    viewer.tree.owner_id,
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
                <p className="text-sand">В этом древе нет персон на модерации.</p>
              )}
            </div>
          </div>,
          document.body,
        )}

      {/* -------- Полноэкранный просмотр общего древа -------- */}
      {mounted &&
        mergePreview &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex flex-col bg-background">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div className="flex min-w-[200px] items-center gap-2.5">
                <span className="text-[16px] font-bold text-gold-light">
                  {mergePreview.title}
                </span>
                <span className="text-[13px] text-sand">
                  {mergePreview.subtitle}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {mergePreview.approveId != null && (
                  <button
                    type="button"
                    className={`${BTN_PRIMARY} !px-3 !py-1.5 !text-[13px]`}
                    disabled={busyKey === `merge-${mergePreview.approveId}`}
                    onClick={() => {
                      const m = merges.find(
                        (x) => x.id === mergePreview.approveId,
                      );
                      if (m)
                        void decideMerge(
                          { kind: "merge", key: `merge-${m.id}`, m },
                          "approveMerge",
                        );
                    }}
                  >
                    ✓ Одобрить
                  </button>
                )}
                <button
                  type="button"
                  className={
                    mergePreview.approveId != null ? BTN_SECONDARY : BTN_PRIMARY
                  }
                  onClick={() => setMergePreview(null)}
                >
                  {mergePreview.approveId != null ? "Закрыть" : "Готово"}
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {mergePreview.loading && !mergePreview.nodes ? (
                <p className="text-sand">Строим общее древо…</p>
              ) : mergePreview.nodes && mergePreview.nodes.length > 0 ? (
                <div className="rounded-xl border border-line bg-gold/[0.03] p-2">
                  <TreeView
                    people={fullTreeToPeople(mergePreview.nodes)}
                    selectedId={mergePreview.selectedId}
                    onSelect={(id) =>
                      setMergePreview((prev) =>
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
