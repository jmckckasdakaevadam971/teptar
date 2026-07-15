"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, MapPin, Pencil, Plus, Trash2, Users } from "lucide-react";
import { api } from "@/lib/api";
import type { Teip, TeipNotable } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { TeipMapModal } from "@/components/DirectoryView/TeipMapModal";

type TeipWithStats = Teip & { stats?: { persons: number } };

/** Пустая форма личности. */
const emptyForm = { name: "", years: "", description: "" };

export function TeipDetail({ teipId }: { teipId: number }) {
  const router = useRouter();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";

  const [teip, setTeip] = useState<TeipWithStats | null>(null);
  const [notables, setNotables] = useState<TeipNotable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);

  // Инлайн-форма личности: null — скрыта, 0 — добавление, id — редактирование.
  const [formFor, setFormFor] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [t, n] = await Promise.all([
        api.teips.get(teipId),
        api.teips.notables(teipId),
      ]);
      setTeip(t);
      setNotables(n);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [teipId]);

  useEffect(() => {
    void load();
  }, [load]);

  function openForm(notable?: TeipNotable) {
    setFormFor(notable ? notable.id : 0);
    setForm(
      notable
        ? {
            name: notable.name,
            years: notable.years ?? "",
            description: notable.description ?? "",
          }
        : emptyForm,
    );
    setFormError(null);
  }

  async function saveNotable() {
    setSaving(true);
    setFormError(null);
    try {
      if (form.name.trim().length < 2) throw new Error("Укажите имя");
      const data = {
        name: form.name.trim(),
        years: form.years.trim() || null,
        description: form.description.trim() || null,
      };
      if (formFor === 0) {
        const created = await api.teips.addNotable(teipId, data);
        setNotables((prev) => [...prev, created]);
      } else if (formFor != null) {
        const updated = await api.teips.updateNotable(formFor, data);
        setNotables((prev) =>
          prev.map((n) => (n.id === updated.id ? updated : n)),
        );
      }
      setFormFor(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  async function removeNotable(n: TeipNotable) {
    if (!confirm(`Удалить «${n.name}» из списка личностей?`)) return;
    try {
      await api.teips.removeNotable(n.id);
      setNotables((prev) => prev.filter((x) => x.id !== n.id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Не удалось удалить");
    }
  }

  if (loading) {
    return <p className="py-12 text-center text-muted-foreground">Загрузка…</p>;
  }
  if (error || !teip) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <p className="text-danger">{error ?? "Тейп не найден"}</p>
        <Link
          href="/reference"
          className="flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Вернуться к справочнику
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <Link
        href="/reference"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Все тейпы
      </Link>

      {/* Основные сведения */}
      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-2xl font-bold text-foreground">
            О тейпе
          </h2>
          <button
            type="button"
            onClick={() => setShowMap(true)}
            className="flex items-center gap-1.5 rounded-lg border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:border-primary"
          >
            <MapPin className="h-3.5 w-3.5" />
            {isSuperAdmin ? "Карта и редактирование" : "Показать на карте"}
          </button>
        </div>

        <p className="mt-4 leading-relaxed text-muted-foreground">
          {teip.description ?? "Описание появится позже."}
        </p>

        <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-border pt-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Тукхум
            </dt>
            <dd className="mt-1 font-medium text-foreground">
              {teip.tukhum_name ?? "Вне тукхумов"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Место основания
            </dt>
            <dd className="mt-1 font-medium text-foreground">
              {teip.origin_place ?? "Не указано"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Персон в родословных
            </dt>
            <dd className="mt-1 flex items-center gap-1.5 font-medium text-foreground">
              <Users className="h-3.5 w-3.5 text-primary" />
              {teip.stats?.persons ?? 0}
            </dd>
          </div>
          {teip.aliases && teip.aliases.length > 0 ? (
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Варианты написания
              </dt>
              <dd className="mt-1 font-medium text-foreground">
                {teip.aliases.join(", ")}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      {/* Исторические личности */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-2xl font-bold text-foreground">
            Исторические личности
          </h2>
          {isSuperAdmin && formFor === null ? (
            <button
              type="button"
              onClick={() => openForm()}
              className="flex items-center gap-1 rounded-lg border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:border-primary"
            >
              <Plus className="h-3.5 w-3.5" />
              Добавить личность
            </button>
          ) : null}
        </div>

        {isSuperAdmin && formFor !== null ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
            <h3 className="font-semibold text-foreground">
              {formFor === 0 ? "Новая личность" : "Редактирование"}
            </h3>
            <div className="flex flex-col gap-3 md:flex-row">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Имя"
                className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
              <input
                value={form.years}
                onChange={(e) => setForm({ ...form, years: e.target.value })}
                placeholder="Годы жизни (напр. 1794–1861)"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary md:w-64"
              />
            </div>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              rows={3}
              placeholder="Кем был, чем известен (необязательно)"
              className="resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
            {formError ? <p className="text-sm text-danger">{formError}</p> : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFormFor(null)}
                className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveNotable()}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-60"
              >
                {saving ? "Сохраняю…" : "Сохранить"}
              </button>
            </div>
          </div>
        ) : null}

        {notables.length === 0 && formFor === null ? (
          <p className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            Сведения об исторических личностях тейпа появятся позже.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {notables.map((n) => (
              <article
                key={n.id}
                className="flex flex-col rounded-2xl border border-border bg-card p-6"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-serif text-xl font-bold text-foreground">
                      {n.name}
                    </h3>
                    {n.years ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {n.years}
                      </p>
                    ) : null}
                  </div>
                  {isSuperAdmin ? (
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => openForm(n)}
                        title="Редактировать"
                        className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeNotable(n)}
                        title="Удалить"
                        className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:border-danger hover:text-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                </div>
                {n.description ? (
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {n.description}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      {showMap ? (
        <TeipMapModal
          teip={teip}
          canEdit={isSuperAdmin}
          onClose={() => setShowMap(false)}
          onSaved={(updated) => {
            setTeip((prev) => (prev ? { ...prev, ...updated } : prev));
            router.refresh(); // обновить серверный заголовок страницы
          }}
          onDeleted={() => {
            router.push("/reference");
          }}
        />
      ) : null}
    </div>
  );
}
