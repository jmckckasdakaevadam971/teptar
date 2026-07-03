"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Plus,
  TreePine,
  X,
  Calendar,
  Users,
  MapPin,
  Heart,
  Trash2,
  Save,
  Check,
  LogIn,
  Globe,
} from "lucide-react";
import type { Person } from "@/lib/demo-data";
import { getSpouses, isFemale } from "@/lib/demo-data";
import { useAuth, getToken } from "@/lib/auth";
import { api } from "@/lib/api";
import { TEIPS, GARS_BY_TEIP } from "@/lib/teips";
import { VILLAGES } from "@/lib/villages";
import { TreeView } from "@/components/TreeView/TreeView";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  ERR_TEXT,
  FIELD,
  FORM_ROW,
  INPUT,
  LABEL,
} from "@/lib/ui";

// ⚠️ ВРЕМЕННО: всё состояние держим локально, без бэкенда.
// Сохранение идёт в localStorage браузера и привязано к конкретному аккаунту,
// чтобы черновик одного пользователя не показывался в другом аккаунте на том же устройстве.
// Когда заработают вход и API — заменить на api.persons.* и загрузку древа.
const STORAGE_PREFIX = "vorhda:my-tree";
// Старый общий ключ (без привязки к аккаунту) — удаляем его, он «протекал» между аккаунтами.
const LEGACY_STORAGE_KEY = "vorhda:my-tree";

/** Ключ хранилища черновика для конкретного аккаунта (или гостя). */
function storageKeyFor(userId?: number | null): string {
  return userId ? `${STORAGE_PREFIX}:${userId}` : `${STORAGE_PREFIX}:guest`;
}

type Relation = "founder" | "son" | "daughter" | "father" | "wife";

type Draft = {
  name: string;
  birth: string;
  death: string;
  role: string;
  teip: string;
  gar: string;
  village: string;
  spouseName: string;
  bio: string;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  birth: "",
  death: "",
  role: "",
  teip: "",
  gar: "",
  village: "",
  spouseName: "",
  bio: "",
};

const RELATION_LABEL: Record<Relation, string> = {
  founder: "Первый предок",
  son: "Сын",
  daughter: "Дочь",
  father: "Отец",
  wife: "Жена",
};

/** Извлечь год (число) из произвольной строки вида «1920», «1920 г.». */
function parseYear(value?: string): number | null {
  if (!value) return null;
  const m = value.match(/\d{1,4}/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

export function MyTreeClient() {
  const { user, ready } = useAuth();
  const [started, setStarted] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [relation, setRelation] = useState<Relation | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [teipFocused, setTeipFocused] = useState(false);
  const [garFocused, setGarFocused] = useState(false);
  const [villageFocused, setVillageFocused] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [publishedOpen, setPublishedOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const lastSavedRef = useRef("[]");

  useEffect(() => {
    setMounted(true);
  }, []);

  // Загружаем черновик конкретного аккаунта. При смене аккаунта — перезагружаем.
  useEffect(() => {
    if (!ready) return;
    const key = storageKeyFor(user?.id);
    // Разовая очистка старого общего ключа, который «протекал» между аккаунтами.
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // хранилище недоступно
    }
    try {
      let raw = localStorage.getItem(key);
      // Перенос гостевого черновика в аккаунт при первом входе (без утечки между аккаунтами).
      if (user?.id && !raw) {
        const guestRaw = localStorage.getItem(storageKeyFor(null));
        if (guestRaw) {
          localStorage.setItem(key, guestRaw);
          localStorage.removeItem(storageKeyFor(null));
          raw = guestRaw;
        }
      }
      if (raw) {
        const parsed = JSON.parse(raw) as Person[];
        if (Array.isArray(parsed) && parsed.length) {
          setPeople(parsed);
          setStarted(true);
          lastSavedRef.current = raw;
          return;
        }
      }
      // У этого аккаунта нет сохранённого древа — начинаем с чистого листа.
      setPeople([]);
      setStarted(false);
      setSelectedId(null);
      lastSavedRef.current = "[]";
    } catch {
      // Повреждённые данные просто игнорируем.
    }
  }, [ready, user?.id]);

  // Отмечаем несохранённые изменения. Любая правка снова разрешает отправку.
  useEffect(() => {
    if (!mounted) return;
    setDirty(JSON.stringify(people) !== lastSavedRef.current);
    setSubmitted(false);
  }, [people, mounted]);

  function saveTree() {
    try {
      const serialized = JSON.stringify(people);
      localStorage.setItem(storageKeyFor(user?.id), serialized);
      lastSavedRef.current = serialized;
      setDirty(false);
    } catch {
      // Хранилище недоступно (приватный режим и т.п.).
    }
  }

  // Отправить древо в общую базу → на модерацию.
  // Создаём персоны в бэкенде (от предков к потомкам, со связями
  // отец→ребёнок и сопоставлением тейпа/гара/села по названию), затем
  // переводим всё древо в visibility='public', status='pending'. После
  // одобрения модератором оно становится публичным и попадаёт в /trees.
  async function publishTree() {
    if (people.length === 0 || publishing) return;
    const token = getToken();
    if (!token) {
      setPublishError("Чтобы отправить древо на модерацию, войдите в аккаунт.");
      return;
    }
    setPublishing(true);
    setPublishError(null);
    try {
      saveTree();

      // Справочники для сопоставления названий → id.
      // id в БД — bigint, и pg отдаёт их строками, поэтому приводим к Number.
      const [teipList, villageList] = await Promise.all([
        api.teips.list().catch(() => []),
        api.villages.list().catch(() => []),
      ]);
      const teipMap = new Map(
        teipList.map((t) => [t.name.trim().toLowerCase(), Number(t.id)]),
      );
      const villageMap = new Map(
        villageList.map((v) => [v.name.trim().toLowerCase(), Number(v.id)]),
      );

      // Гары рода (одного тейпа) — подгружаем по выбранному тейпу.
      let garMap = new Map<string, number>();
      const rootTeipId = lockedTeip
        ? teipMap.get(lockedTeip.trim().toLowerCase())
        : undefined;
      if (rootTeipId) {
        const gars = await api.teips.gars(rootTeipId).catch(() => []);
        garMap = new Map(
          gars.map((g) => [g.name.trim().toLowerCase(), Number(g.id)]),
        );
      }

      // Формируем весь пакет и отправляем одним запросом: бэкенд в одной
      // транзакции удалит прежнее древо и создаст новое (родитель — по temp_id).
      const payload = people.map((p) => {
        const noteParts: string[] = [];
        if (p.bio) noteParts.push(p.bio);
        {
          const spouses = getSpouses(p);
          if (spouses.length)
            noteParts.push(
              spouses.length > 1
                ? `Жёны: ${spouses.join(", ")}`
                : `Супруга: ${spouses[0]}`,
            );
        }
        return {
          temp_id: p.id,
          full_name: p.name,
          gender:
            p.role?.trim().toLowerCase() === "дочь"
              ? ("f" as const)
              : ("m" as const),
          birth_year: parseYear(p.birth),
          death_year: parseYear(p.death),
          parent_temp_id: p.parentId ?? null,
          teip_id:
            (p.teip ? teipMap.get(p.teip.trim().toLowerCase()) : undefined) ??
            null,
          gar_id:
            (p.gar ? garMap.get(p.gar.trim().toLowerCase()) : undefined) ??
            null,
          village_id:
            (p.village
              ? villageMap.get(p.village.trim().toLowerCase())
              : undefined) ?? null,
          note: noteParts.join(". ") || null,
        };
      });

      await api.persons.bulkReplace(payload);

      setSubmitted(true);
      setPublishedOpen(true);
    } catch (e) {
      setPublishError(
        e instanceof Error ? e.message : "Не удалось отправить древо.",
      );
    } finally {
      setPublishing(false);
    }
  }

  const isFirst = people.length === 0;
  const selected = people.find((p) => p.id === selectedId) ?? null;
  // Человек, открытый в форме редактирования (relation при этом null).
  const editingPerson = editingId
    ? (people.find((p) => p.id === editingId) ?? null)
    : null;
  const minGen = people.length
    ? Math.min(...people.map((p) => p.generation))
    : 0;

  // Тейп рода задаётся один раз (для первого предка) и дальше не меняется.
  const lockedTeip = people.find((p) => p.teip && p.teip !== "—")?.teip ?? null;

  // Подсказки по тейпу: показываем похожие, пока пользователь печатает.
  const teipQuery = draft.teip.trim().toLowerCase();
  const teipSuggestions =
    teipFocused && teipQuery
      ? TEIPS.filter(
          (t) =>
            t.toLowerCase().includes(teipQuery) &&
            t.toLowerCase() !== teipQuery,
        ).slice(0, 6)
      : [];

  // Подсказки по гару — только ветви выбранного тейпа рода.
  const activeTeip = lockedTeip ?? draft.teip.trim();
  const garOptions = GARS_BY_TEIP[activeTeip] ?? [];
  const garQuery = draft.gar.trim().toLowerCase();
  const garSuggestions = garFocused
    ? garOptions
        .filter(
          (g) =>
            (!garQuery || g.toLowerCase().includes(garQuery)) &&
            g.toLowerCase() !== garQuery,
        )
        .slice(0, 6)
    : [];

  // Подсказки по населённому пункту.
  const villageQuery = draft.village.trim().toLowerCase();
  const villageSuggestions =
    villageFocused && villageQuery
      ? VILLAGES.filter(
          (v) =>
            v.toLowerCase().includes(villageQuery) &&
            v.toLowerCase() !== villageQuery,
        ).slice(0, 6)
      : [];

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  /** Клик по карточке — только выделение (показывает «+» вокруг), без панели.
      Повторный клик по уже выбранной карточке снимает выделение — «+» исчезают. */
  function selectPerson(id: string) {
    setSelectedId((prev) => (prev === id ? null : id));
    setConfirmDelete(false);
  }

  /** «Информация» в бургере карточки — открывает боковую панель. */
  function showInfo(id: string) {
    setSelectedId(id);
    setPanelOpen(true);
    setConfirmDelete(false);
  }

  /** «Удалить» в бургере карточки — открывает панель сразу с подтверждением удаления. */
  function askDelete(id: string) {
    setSelectedId(id);
    setPanelOpen(true);
    setConfirmDelete(true);
  }

  /** Закрыть панель, ОСТАВИВ узел выбранным — вокруг него остаются «+» для добавления родных. */
  function hidePanel() {
    setPanelOpen(false);
    setConfirmDelete(false);
  }

  function closePanel() {
    setSelectedId(null);
    setPanelOpen(false);
    setConfirmDelete(false);
  }

  // Удаление человека: его детей переподвешиваем к деду (родителю удаляемого),
  // а всю ветвь ниже поднимаем на одно поколение, чтобы не было разрыва.
  function deletePerson(id: string) {
    setPeople((prev) => {
      const target = prev.find((p) => p.id === id);
      if (!target) return prev;
      const newParentId = target.parentId;

      // Собираем всех потомков удаляемого (без него самого).
      const descendants = new Set<string>();
      let frontier = [id];
      while (frontier.length) {
        const next: string[] = [];
        for (const p of prev) {
          if (p.parentId && frontier.includes(p.parentId)) {
            descendants.add(p.id);
            next.push(p.id);
          }
        }
        frontier = next;
      }

      return prev
        .filter((p) => p.id !== id)
        .map((p) => {
          if (p.parentId === id) {
            // Прямые дети — к деду и на поколение выше.
            return {
              ...p,
              parentId: newParentId,
              generation: p.generation - 1,
            };
          }
          if (descendants.has(p.id)) {
            // Более дальние потомки — просто поднимаем на поколение.
            return { ...p, generation: p.generation - 1 };
          }
          return p;
        });
    });
    closePanel();
  }

  function openForm(rel: Relation) {
    setRelation(rel);
    setEditingId(null);
    setDraft({ ...EMPTY_DRAFT, teip: lockedTeip ?? "" });
    setTeipFocused(false);
    setGarFocused(false);
    setVillageFocused(false);
    setError(null);
    setFormOpen(true);
  }

  /** Редактирование существующего человека — та же форма, но с заполненными полями. */
  function openEdit(id: string) {
    const person = people.find((p) => p.id === id);
    if (!person) return;
    setSelectedId(id);
    setRelation(null);
    setEditingId(id);
    setDraft({
      name: person.name,
      birth: person.birth ?? "",
      death: person.death ?? "",
      role: person.role === "—" ? "" : person.role,
      teip: person.teip === "—" ? "" : person.teip,
      gar: person.gar ?? "",
      village: person.village ?? "",
      spouseName: getSpouses(person).join(", "),
      bio: person.bio ?? "",
    });
    setTeipFocused(false);
    setGarFocused(false);
    setVillageFocused(false);
    setError(null);
    setPanelOpen(false);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setDraft(EMPTY_DRAFT);
    setError(null);
    setRelation(null);
    setEditingId(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const name = draft.name.trim();
    if (name.length < 2) {
      setError("Укажите имя (не короче 2 символов).");
      return;
    }
    const birth = draft.birth.trim();
    const death = draft.death.trim();
    if (birth && death && Number(death) < Number(birth)) {
      setError("Год смерти не может быть раньше года рождения.");
      return;
    }

    // Редактирование — обновляем поля существующего человека (связи не трогаем).
    if (editingId) {
      // поле «Жёны» принимает несколько имён через запятую
      const spouses = draft.spouseName
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      setPeople((prev) =>
        prev.map((p) =>
          p.id === editingId
            ? {
                ...p,
                name,
                birth: birth || undefined,
                death: death || undefined,
                teip: lockedTeip ?? (draft.teip.trim() || p.teip),
                gar: draft.gar.trim() || undefined,
                village: draft.village.trim() || undefined,
                spouseName: undefined,
                spouseNames: spouses.length ? spouses : undefined,
                bio: draft.bio.trim() || undefined,
              }
            : p,
        ),
      );
      closeForm();
      return;
    }

    // Жена — добавляем в список жён выбранного человека, без отдельного узла.
    if (relation === "wife" && selected) {
      setPeople((prev) =>
        prev.map((p) =>
          p.id === selected.id
            ? {
                ...p,
                spouseName: undefined,
                spouseNames: [...getSpouses(p), name],
              }
            : p,
        ),
      );
      closeForm();
      return;
    }

    let generation = 0;
    let parentId: string | undefined;
    if (relation === "son" || relation === "daughter") {
      generation = (selected?.generation ?? 0) + 1;
      parentId = selected?.id;
    } else if (relation === "father") {
      generation = (selected?.generation ?? 0) - 1;
    }

    const newId = `p${Date.now()}`;
    const person: Person = {
      id: newId,
      name,
      birth: birth || undefined,
      death: death || undefined,
      role: draft.role.trim() || (relation ? RELATION_LABEL[relation] : "—"),
      teip: lockedTeip ?? (draft.teip.trim() || "—"),
      gar: draft.gar.trim() || undefined,
      village: draft.village.trim() || undefined,
      spouseNames: draft.spouseName
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      bio: draft.bio.trim() || undefined,
      gender: relation === "daughter" ? "f" : "m",
      generation,
      parentId,
    };

    setPeople((prev) => {
      let next = [...prev, person];
      // Отец: ребёнком нового узла становится не только выбранный человек,
      // но и все его родные братья и сёстры — те, кто на том же поколении
      // и пока без родителя (общий отец у них один).
      if (relation === "father" && selected) {
        next = next.map((p) =>
          p.id !== newId &&
          p.parentId === selected.parentId &&
          p.generation === selected.generation
            ? { ...p, parentId: newId }
            : p,
        );
      }
      return next;
    });
    closeForm();
  }

  // 0. Создавать древо могут только зарегистрированные пользователи.
  if (!ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center rounded-3xl border border-border bg-card/40 px-6 py-20 text-muted-foreground">
        Загрузка…
      </div>
    );
  }
  // В dev-режиме (локально) разрешаем строить древо без входа — чтобы проверять
  // изменения. В проде гейт обязателен.
  if (!user && process.env.NODE_ENV !== "development") {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-border bg-card/40 px-6 py-20 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-primary">
          <LogIn className="h-8 w-8" />
        </span>
        <h2 className="mt-6 font-serif text-2xl font-bold text-foreground">
          Нужен вход в аккаунт
        </h2>
        <p className="mt-2 max-w-md text-pretty leading-relaxed text-muted-foreground">
          Создавать родовое древо могут только зарегистрированные пользователи.
          Войдите или зарегистрируйтесь, чтобы начать.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/login?next=/my" className={BTN_PRIMARY}>
            <LogIn className="h-4 w-4" />
            Войти
          </Link>
          <Link href="/login?next=/my" className={BTN_SECONDARY}>
            Зарегистрироваться
          </Link>
        </div>
      </div>
    );
  }

  // 1. Древо ещё не создано — экран с кнопкой «Создать древо».
  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-border bg-card/40 px-6 py-20 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-primary">
          <TreePine className="h-8 w-8" />
        </span>
        <h2 className="mt-6 font-serif text-2xl font-bold text-foreground">
          У вас пока нет древа
        </h2>
        <p className="mt-2 max-w-md text-pretty leading-relaxed text-muted-foreground">
          Создайте родовое древо и добавьте первого предка, о котором у вас есть
          сведения. Дальше можно будет достраивать ветви потомков.
        </p>
        <button
          type="button"
          onClick={() => setStarted(true)}
          className={`mt-8 ${BTN_PRIMARY}`}
        >
          <Plus className="h-4 w-4" />
          Создать древо
        </button>
      </div>
    );
  }

  // 2. Древо создано — редактор.
  return (
    <div className="rounded-3xl border border-border bg-card/40 p-4 md:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-xl font-semibold text-foreground">
            Редактор древа
          </h2>
          <p className="text-sm text-muted-foreground">
            {isFirst
              ? "Добавьте самого старшего предка, с которого начнётся древо."
              : "Выберите человека в древе, чтобы добавить сына, дочь, отца или жену."}
          </p>
        </div>
        {/* Кнопка нужна только для самого первого человека. */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={saveTree}
            disabled={people.length === 0 || !dirty}
            className={`${BTN_SECONDARY} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {dirty ? (
              <Save className="h-4 w-4" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {dirty ? "Сохранить" : "Сохранено"}
          </button>
          <button
            type="button"
            onClick={publishTree}
            disabled={people.length === 0 || publishing || submitted}
            className={`${BTN_PRIMARY} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <Globe className="h-4 w-4" />
            {publishing
              ? "Отправка…"
              : submitted
                ? "Отправлено"
                : "Отправить в общий доступ"}
          </button>
          {isFirst ? (
            <button
              type="button"
              onClick={() => openForm("founder")}
              className={BTN_PRIMARY}
            >
              <Plus className="h-4 w-4" />
              Добавить человека
            </button>
          ) : null}
        </div>
      </div>

      {publishError ? <p className={ERR_TEXT}>{publishError}</p> : null}

      {isFirst ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-16 text-center">
          <p className="max-w-sm text-pretty leading-relaxed text-muted-foreground">
            Древо пустое. Нажмите «Добавить человека», чтобы внести первого
            предка.
          </p>
        </div>
      ) : (
        <TreeView
          people={people}
          selectedId={selectedId}
          onSelect={selectPerson}
          onAddRelative={(rel) => openForm(rel)}
          onShowInfo={showInfo}
          onEdit={openEdit}
          onDelete={askDelete}
        />
      )}

      {/* Правая панель выбранного человека с действиями. */}
      {selected && panelOpen && !formOpen && mounted
        ? createPortal(
            <div className="fixed inset-0 z-[60] flex">
              <button
                type="button"
                aria-label="Закрыть"
                className="flex-1 bg-background/70 backdrop-blur-sm"
                onClick={hidePanel}
              />
              <aside className="relative flex h-full w-full max-w-sm flex-col overflow-y-auto border-l border-border bg-card p-6 md:p-8">
                <button
                  type="button"
                  onClick={hidePanel}
                  className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Закрыть"
                >
                  <X className="h-4 w-4" />
                </button>

                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary font-serif text-2xl font-bold text-primary-foreground">
                  {selected.name.charAt(0)}
                </span>
                <h2 className="mt-4 font-serif text-3xl font-bold text-foreground">
                  {selected.name}
                </h2>
                <p className="mt-1 text-muted-foreground">{selected.role}</p>

                <dl className="mt-6 flex flex-col gap-4">
                  <DetailRow
                    icon={<Calendar className="h-4 w-4 text-primary" />}
                    label="Годы жизни"
                    value={`${selected.birth ?? "—"}${
                      selected.death ? `–${selected.death}` : " — наши дни"
                    }`}
                  />
                  <DetailRow
                    icon={<Users className="h-4 w-4 text-primary" />}
                    label="Тейп / гар"
                    value={`${selected.teip}${
                      selected.gar ? ` · ${selected.gar}` : ""
                    }`}
                  />
                  {getSpouses(selected).length ? (
                    <DetailRow
                      icon={<Heart className="h-4 w-4 text-primary" />}
                      label={
                        getSpouses(selected).length > 1 ? "Жёны" : "Супруга"
                      }
                      value={getSpouses(selected).join(", ")}
                    />
                  ) : null}
                  <DetailRow
                    icon={<MapPin className="h-4 w-4 text-primary" />}
                    label="Поколение"
                    value={`${selected.generation - minGen + 1}-е`}
                  />
                </dl>

                {selected.bio ? (
                  <div className="mt-6 rounded-xl border border-border bg-secondary/40 p-4">
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {selected.bio}
                    </p>
                  </div>
                ) : null}

                {/* Добавление родственников — только через «+» на самом древе,
                    из панели информации эта возможность убрана. */}

                {/* Подтверждение удаления — открывается пунктом «Удалить» в бургер-меню карточки. */}
                {confirmDelete ? (
                  <div className="mt-6 border-t border-border pt-6">
                    <div className="rounded-xl border border-[#5b2c25] bg-[#2a1714] p-4">
                      <p className="text-sm text-[#e6c9c2]">
                        Удалить «{selected.name}»? Его дети перейдут к родителю
                        выше. Действие нельзя отменить.
                      </p>
                      <div className="mt-3 flex gap-3">
                        <button
                          type="button"
                          onClick={() => deletePerson(selected.id)}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#7a2f26] px-4 py-2.5 text-sm font-semibold text-[#ffd9d2] transition-colors hover:bg-[#8f372d]"
                        >
                          <Trash2 className="h-4 w-4" />
                          Удалить
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(false)}
                          className={BTN_SECONDARY}
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </aside>
            </div>,
            document.body,
          )
        : null}

      {/* Форма добавления человека — через портал, чтобы fixed считался от окна,
          а не от трансформированного блока Reveal. */}
      {formOpen && mounted
        ? createPortal(
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-8">
              <button
                type="button"
                aria-label="Закрыть"
                className="absolute inset-0 bg-background/80 backdrop-blur-sm"
                onClick={closeForm}
              />
              <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
                {/* Шапка окна */}
                <div className="flex items-start justify-between gap-4 border-b border-border px-8 py-5">
                  <div>
                    <h2 className="font-serif text-2xl font-bold text-foreground">
                      {editingId
                        ? `Редактирование — ${draft.name || "…"}`
                        : relation
                          ? RELATION_LABEL[relation]
                          : "Новый человек"}
                      {!editingId &&
                      relation &&
                      relation !== "founder" &&
                      selected
                        ? ` — ${selected.name}`
                        : ""}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {editingId
                        ? "Измените данные и нажмите «Сохранить»."
                        : formSubtitle(relation, selected?.name)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeForm}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Закрыть"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Тело формы (прокручивается) */}
                <form
                  id="person-form"
                  onSubmit={handleSubmit}
                  className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-8 py-6"
                >
                  <div className={FIELD}>
                    <label className={LABEL} htmlFor="name">
                      Имя *
                    </label>
                    <input
                      id="name"
                      className={INPUT}
                      value={draft.name}
                      onChange={(e) => set("name", e.target.value)}
                      placeholder="Напр. Тарам"
                      autoFocus
                    />
                  </div>

                  <div className={FIELD}>
                    <label className={LABEL} htmlFor="village">
                      Населённый пункт
                    </label>
                    <div className="relative">
                      <input
                        id="village"
                        className={INPUT}
                        value={draft.village}
                        onChange={(e) => set("village", e.target.value)}
                        onFocus={() => setVillageFocused(true)}
                        onBlur={() =>
                          setTimeout(() => setVillageFocused(false), 120)
                        }
                        placeholder="Напр. Ведено"
                        autoComplete="off"
                      />
                      {villageSuggestions.length > 0 ? (
                        <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-52 overflow-auto rounded-xl border border-border bg-card py-1 shadow-lg">
                          {villageSuggestions.map((v) => (
                            <li key={v}>
                              <button
                                type="button"
                                className="flex w-full items-center px-3 py-2 text-left text-sm text-foreground hover:bg-secondary"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  set("village", v);
                                  setVillageFocused(false);
                                }}
                              >
                                {v}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </div>

                  <div className={FORM_ROW}>
                    <div className={FIELD}>
                      <label className={LABEL} htmlFor="birth">
                        Год рождения
                      </label>
                      <input
                        id="birth"
                        className={INPUT}
                        value={draft.birth}
                        onChange={(e) => set("birth", e.target.value)}
                        placeholder="Год"
                        inputMode="numeric"
                      />
                    </div>
                    <div className={FIELD}>
                      <label className={LABEL} htmlFor="death">
                        Год смерти
                      </label>
                      <input
                        id="death"
                        className={INPUT}
                        value={draft.death}
                        onChange={(e) => set("death", e.target.value)}
                        placeholder="Год"
                        inputMode="numeric"
                      />
                    </div>
                  </div>

                  {relation !== "wife" ? (
                    <>
                      <div className={FORM_ROW}>
                        <div className={FIELD}>
                          <label className={LABEL} htmlFor="teip">
                            Тейп
                          </label>
                          {lockedTeip ? (
                            <>
                              <input
                                id="teip"
                                className={`${INPUT} cursor-not-allowed opacity-70`}
                                value={lockedTeip}
                                readOnly
                                disabled
                              />
                              <p className="text-xs text-muted-foreground">
                                Тейп рода задан и одинаков для всех — изменить
                                нельзя.
                              </p>
                            </>
                          ) : (
                            <div className="relative">
                              <input
                                id="teip"
                                className={INPUT}
                                value={draft.teip}
                                onChange={(e) => set("teip", e.target.value)}
                                onFocus={() => setTeipFocused(true)}
                                onBlur={() =>
                                  setTimeout(() => setTeipFocused(false), 120)
                                }
                                placeholder="Начните вводить тейп"
                                autoComplete="off"
                              />
                              {teipSuggestions.length > 0 ? (
                                <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-52 overflow-auto rounded-xl border border-border bg-card py-1 shadow-lg">
                                  {teipSuggestions.map((t) => (
                                    <li key={t}>
                                      <button
                                        type="button"
                                        className="flex w-full items-center px-3 py-2 text-left text-sm text-foreground hover:bg-secondary"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                          set("teip", t);
                                          setTeipFocused(false);
                                        }}
                                      >
                                        {t}
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                          )}
                        </div>
                        <div className={FIELD}>
                          <label className={LABEL} htmlFor="gar">
                            Гар
                          </label>
                          <div className="relative">
                            <input
                              id="gar"
                              className={INPUT}
                              value={draft.gar}
                              onChange={(e) => set("gar", e.target.value)}
                              onFocus={() => setGarFocused(true)}
                              onBlur={() =>
                                setTimeout(() => setGarFocused(false), 120)
                              }
                              placeholder={
                                garOptions.length
                                  ? "Выберите или введите"
                                  : "Необязательно"
                              }
                              autoComplete="off"
                            />
                            {garSuggestions.length > 0 ? (
                              <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-52 overflow-auto rounded-xl border border-border bg-card py-1 shadow-lg">
                                {garSuggestions.map((g) => (
                                  <li key={g}>
                                    <button
                                      type="button"
                                      className="flex w-full items-center px-3 py-2 text-left text-sm text-foreground hover:bg-secondary"
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={() => {
                                        set("gar", g);
                                        setGarFocused(false);
                                      }}
                                    >
                                      {g}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {/* Супруга — не для дочери и не для женского узла: жену не вписывают. */}
                      {relation !== "daughter" &&
                      !(editingPerson && isFemale(editingPerson)) ? (
                        <div className={FIELD}>
                          <label className={LABEL} htmlFor="spouse">
                            Супруги
                          </label>
                          <input
                            id="spouse"
                            className={INPUT}
                            value={draft.spouseName}
                            onChange={(e) => set("spouseName", e.target.value)}
                            placeholder="Необязательно, несколько — через запятую"
                          />
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  <div className={FIELD}>
                    <label className={LABEL} htmlFor="bio">
                      Биография
                    </label>
                    <textarea
                      id="bio"
                      className={`${INPUT} min-h-20 resize-y`}
                      value={draft.bio}
                      onChange={(e) => set("bio", e.target.value)}
                      placeholder="Краткие сведения о человеке"
                    />
                  </div>

                  {error ? <p className={ERR_TEXT}>{error}</p> : null}
                </form>

                {/* Подвал с действиями */}
                <div className="flex justify-end gap-3 border-t border-border px-8 py-5">
                  <button
                    type="button"
                    className={BTN_SECONDARY}
                    onClick={closeForm}
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    form="person-form"
                    className={BTN_PRIMARY}
                  >
                    Добавить
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* Окно подтверждения отправки древа на модерацию. */}
      {publishedOpen && mounted
        ? createPortal(
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-8">
              <button
                type="button"
                aria-label="Закрыть"
                className="absolute inset-0 bg-background/80 backdrop-blur-sm"
                onClick={() => setPublishedOpen(false)}
              />
              <div className="relative flex w-full max-w-md flex-col items-center overflow-hidden rounded-3xl border border-border bg-card p-8 text-center shadow-2xl">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-primary">
                  <Check className="h-8 w-8" />
                </span>
                <h2 className="mt-6 font-serif text-2xl font-bold text-foreground">
                  Древо отправлено на модерацию
                </h2>
                <p className="mt-2 text-pretty leading-relaxed text-muted-foreground">
                  Древо проверят модераторы и супер-админ. После одобрения оно
                  появится в общем доступе.
                </p>
                <button
                  type="button"
                  onClick={() => setPublishedOpen(false)}
                  className={`mt-8 ${BTN_PRIMARY}`}
                >
                  Понятно
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function formSubtitle(relation: Relation | null, name?: string): string {
  switch (relation) {
    case "founder":
      return "С этого человека начнётся ваше древо.";
    case "son":
      return `Новый сын человека ${name ?? ""}.`;
    case "daughter":
      return `Новая дочь человека ${name ?? ""}.`;
    case "father":
      return `Отец человека ${name ?? ""}. Он встанет выше в древе.`;
    case "wife":
      return `Жена человека ${name ?? ""}.`;
    default:
      return "";
  }
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-secondary">
        {icon}
      </span>
      <div>
        <dt className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </dt>
        <dd className="font-medium text-foreground">{value}</dd>
      </div>
    </div>
  );
}
