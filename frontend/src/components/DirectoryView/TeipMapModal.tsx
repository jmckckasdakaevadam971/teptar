"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { X, MapPin } from "lucide-react";
import type { Teip, Tukhum } from "@/lib/types";
import { api } from "@/lib/api";

const TeipMap = dynamic(() => import("./TeipMap").then((m) => m.TeipMap), {
  ssr: false,
});

interface TeipMapModalProps {
  teip: Teip;
  canEdit: boolean;
  onClose: () => void;
  onSaved: (teip: Teip) => void;
  onDeleted: (id: number) => void;
}

export function TeipMapModal({
  teip,
  canEdit,
  onClose,
  onSaved,
  onDeleted,
}: TeipMapModalProps) {
  const [editing, setEditing] = useState(false);
  const [place, setPlace] = useState(teip.origin_place ?? "");
  const [lat, setLat] = useState(
    teip.origin_lat != null ? String(teip.origin_lat) : "",
  );
  const [lng, setLng] = useState(
    teip.origin_lng != null ? String(teip.origin_lng) : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Редактирование основных данных (название/тукхум/описание).
  const [editingInfo, setEditingInfo] = useState(false);
  const [name, setName] = useState(teip.name);
  const [desc, setDesc] = useState(teip.description ?? "");
  const [tukhumId, setTukhumId] = useState(
    teip.tukhum_id != null ? String(teip.tukhum_id) : "",
  );
  const [tukhums, setTukhums] = useState<Tukhum[] | null>(null);

  useEffect(() => {
    setPlace(teip.origin_place ?? "");
    setLat(teip.origin_lat != null ? String(teip.origin_lat) : "");
    setLng(teip.origin_lng != null ? String(teip.origin_lng) : "");
    setName(teip.name);
    setDesc(teip.description ?? "");
    setTukhumId(teip.tukhum_id != null ? String(teip.tukhum_id) : "");
    setEditing(false);
    setEditingInfo(false);
    setError(null);
  }, [teip]);

  // Список тукхумов нужен только для формы редактирования — грузим лениво.
  useEffect(() => {
    if (editingInfo && tukhums === null) {
      api.tukhums
        .list()
        .then(setTukhums)
        .catch(() => setTukhums([]));
    }
  }, [editingInfo, tukhums]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const parsedLat = lat.trim() ? Number(lat.replace(",", ".")) : null;
      const parsedLng = lng.trim() ? Number(lng.replace(",", ".")) : null;
      if (
        (parsedLat != null && Number.isNaN(parsedLat)) ||
        (parsedLng != null && Number.isNaN(parsedLng))
      ) {
        throw new Error("Координаты должны быть числами");
      }
      const updated = await api.teips.updateOrigin(teip.id, {
        origin_place: place.trim() || null,
        origin_lat: parsedLat,
        origin_lng: parsedLng,
      });
      onSaved(updated);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  async function saveInfo() {
    setSaving(true);
    setError(null);
    try {
      if (name.trim().length < 2) throw new Error("Укажите название");
      const updated = await api.teips.update(teip.id, {
        name: name.trim(),
        description: desc.trim() || null,
        tukhum_id: tukhumId ? Number(tukhumId) : null,
      });
      onSaved(updated);
      setEditingInfo(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  async function removeTeip() {
    if (
      !confirm(
        `Удалить тейп «${teip.name}» из справочника? Действие необратимо.`,
      )
    )
      return;
    setSaving(true);
    setError(null);
    try {
      await api.teips.remove(teip.id);
      onDeleted(teip.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить");
      setSaving(false);
    }
  }

  const hasExactCoords = teip.origin_lat != null && teip.origin_lng != null;
  const hasApproxCoords =
    !hasExactCoords &&
    teip.tukhum_approx_lat != null &&
    teip.tukhum_approx_lng != null;
  const mapLat = hasExactCoords
    ? (teip.origin_lat as number)
    : (teip.tukhum_approx_lat as number);
  const mapLng = hasExactCoords
    ? (teip.origin_lng as number)
    : (teip.tukhum_approx_lng as number);
  const hasCoords = hasExactCoords || hasApproxCoords;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-8">
      <button
        type="button"
        aria-label="Закрыть"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-8 py-5">
          <div>
            <h2 className="font-serif text-2xl font-bold text-foreground">
              {teip.name}
            </h2>
            {teip.tukhum_name ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Тукхум {teip.tukhum_name}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Закрыть"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {teip.description ?? "Описание появится позже."}
          </p>

          <div className="mt-5 flex items-center gap-1.5 text-sm text-foreground">
            <MapPin className="h-4 w-4 text-primary" />
            {hasExactCoords
              ? teip.origin_place || "Место основания"
              : hasApproxCoords
                ? `Приблизительно: район тукхума ${teip.tukhum_name ?? ""}`
                : "Место основания уточняется"}
          </div>

          {hasCoords ? (
            <>
              <div className="mt-4 h-72 w-full overflow-hidden rounded-2xl border border-border">
                <TeipMap
                  lat={mapLat}
                  lng={mapLng}
                  zoom={hasExactCoords ? 10 : 8}
                  label={
                    hasExactCoords
                      ? teip.origin_place || teip.name
                      : `${teip.name} — приблизительный район`
                  }
                />
              </div>
              {hasApproxCoords ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Точное место основания пока не указано — показан
                  приблизительный исторический район тукхума.
                </p>
              ) : null}
            </>
          ) : (
            <div className="mt-4 flex h-40 w-full items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
              Координаты места основания пока не указаны
            </div>
          )}

          {canEdit ? (
            editingInfo ? (
              <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-border p-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Название
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Тукхум
                  </label>
                  <select
                    value={tukhumId}
                    onChange={(e) => setTukhumId(e.target.value)}
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                  >
                    <option value="">Без тукхума</option>
                    {(tukhums ?? []).map((tk) => (
                      <option key={tk.id} value={String(tk.id)}>
                        {tk.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Описание
                  </label>
                  <textarea
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    rows={4}
                    className="resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                    placeholder="Краткие сведения о тейпе"
                  />
                </div>
                {error ? (
                  <p className="text-sm text-danger">{error}</p>
                ) : null}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingInfo(false)}
                    className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void saveInfo()}
                    className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-60"
                  >
                    {saving ? "Сохраняю…" : "Сохранить"}
                  </button>
                </div>
              </div>
            ) : editing ? (
              <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-border p-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Место (аул/ущелье)
                  </label>
                  <input
                    value={place}
                    onChange={(e) => setPlace(e.target.value)}
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                    placeholder="Напр. аул Беной, Ножай-Юртовский район"
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex flex-1 flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Широта
                    </label>
                    <input
                      value={lat}
                      onChange={(e) => setLat(e.target.value)}
                      className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                      placeholder="43.05"
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Долгота
                    </label>
                    <input
                      value={lng}
                      onChange={(e) => setLng(e.target.value)}
                      className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                      placeholder="46.31"
                    />
                  </div>
                </div>
                {error ? (
                  <p className="text-sm text-danger">{error}</p>
                ) : null}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void save()}
                    className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-60"
                  >
                    {saving ? "Сохраняю…" : "Сохранить"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingInfo(true)}
                  className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  Редактировать
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  Указать/изменить место на карте
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void removeTeip()}
                  className="rounded-xl border border-danger/40 px-4 py-2 text-sm font-medium text-danger transition-colors hover:border-danger disabled:opacity-60"
                >
                  Удалить
                </button>
                {error ? (
                  <p className="w-full text-sm text-danger">{error}</p>
                ) : null}
              </div>
            )
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
