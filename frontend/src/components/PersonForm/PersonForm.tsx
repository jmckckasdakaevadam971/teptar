"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { Person, Teip, Village, Gender } from "@/lib/types";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  ERR_TEXT,
  FIELD,
  FORM_GRID,
  FORM_ROW,
  INPUT,
  LABEL,
} from "@/lib/ui";

/** Что отправляем в API (совпадает с createPersonSchema на бэкенде). */
export interface PersonInput {
  full_name: string;
  gender: Gender;
  birth_year: number | null;
  death_year: number | null;
  father_id: number | null;
  mother_id: number | null;
  teip_id: number | null;
  village_id: number | null;
  note: string | null;
}

/** Поле <select> в стиле INPUT. */
const SELECT = INPUT + " cursor-pointer";

function toInput(p: Person | null | undefined): PersonInput {
  return {
    full_name: p?.full_name ?? "",
    gender: p?.gender ?? "m",
    birth_year: p?.birth_year ?? null,
    death_year: p?.death_year ?? null,
    father_id: p?.father_id ?? null,
    mother_id: p?.mother_id ?? null,
    teip_id: p?.teip_id ?? null,
    village_id: p?.village_id ?? null,
    note: p?.note ?? null,
  };
}

function numOrNull(v: string): number | null {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export function PersonForm({
  initial,
  persons,
  busy = false,
  submitLabel = "Сохранить",
  onSubmit,
  onCancel,
}: {
  /** Персона для редактирования; пусто — создание. */
  initial?: Person | null;
  /** Существующие персоны древа — для выбора родителей. */
  persons: Person[];
  busy?: boolean;
  submitLabel?: string;
  onSubmit: (input: PersonInput) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<PersonInput>(() => toInput(initial));
  const [teips, setTeips] = useState<Teip[]>([]);
  const [villages, setVillages] = useState<Village[]>([]);
  const [localErr, setLocalErr] = useState<string | null>(null);

  useEffect(() => {
    setForm(toInput(initial));
  }, [initial]);

  useEffect(() => {
    void api.teips
      .list()
      .then(setTeips)
      .catch(() => setTeips([]));
    void api.villages
      .list()
      .then(setVillages)
      .catch(() => setVillages([]));
  }, []);

  // Родителем нельзя выбрать самого себя.
  const candidates = useMemo(
    () => persons.filter((p) => p.id !== initial?.id),
    [persons, initial],
  );
  const fathers = candidates.filter((p) => p.gender === "m");
  const mothers = candidates.filter((p) => p.gender === "f");

  function set<K extends keyof PersonInput>(key: K, value: PersonInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalErr(null);
    const name = form.full_name.trim();
    if (name.length < 2) {
      setLocalErr("Укажите имя (не короче 2 символов).");
      return;
    }
    if (
      form.birth_year != null &&
      form.death_year != null &&
      form.death_year < form.birth_year
    ) {
      setLocalErr("Год смерти не может быть раньше года рождения.");
      return;
    }
    void onSubmit({ ...form, full_name: name });
  }

  return (
    <form onSubmit={handleSubmit} className={FORM_GRID}>
      <div className={FIELD}>
        <label className={LABEL} htmlFor="pf-name">
          Имя / ФИО
        </label>
        <input
          id="pf-name"
          className={INPUT}
          value={form.full_name}
          onChange={(e) => set("full_name", e.target.value)}
          placeholder="Например: Ахмад, сын Хасана"
          autoFocus
        />
      </div>

      <div className={FORM_ROW}>
        <div className={FIELD}>
          <label className={LABEL} htmlFor="pf-gender">
            Пол
          </label>
          <select
            id="pf-gender"
            className={SELECT}
            value={form.gender}
            onChange={(e) => set("gender", e.target.value as Gender)}
          >
            <option value="m">Мужской</option>
            <option value="f">Женский</option>
          </select>
        </div>

        <div className={FIELD}>
          <label className={LABEL} htmlFor="pf-birth">
            Год рождения
          </label>
          <input
            id="pf-birth"
            className={INPUT}
            type="number"
            inputMode="numeric"
            value={form.birth_year ?? ""}
            onChange={(e) => set("birth_year", numOrNull(e.target.value))}
            placeholder="—"
          />
        </div>

        <div className={FIELD}>
          <label className={LABEL} htmlFor="pf-death">
            Год смерти
          </label>
          <input
            id="pf-death"
            className={INPUT}
            type="number"
            inputMode="numeric"
            value={form.death_year ?? ""}
            onChange={(e) => set("death_year", numOrNull(e.target.value))}
            placeholder="— (жив)"
          />
        </div>
      </div>

      <div className={FORM_ROW}>
        <div className={FIELD}>
          <label className={LABEL} htmlFor="pf-father">
            Отец
          </label>
          <select
            id="pf-father"
            className={SELECT}
            value={form.father_id ?? ""}
            onChange={(e) => set("father_id", numOrNull(e.target.value))}
          >
            <option value="">— не указан —</option>
            {fathers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </div>

        <div className={FIELD}>
          <label className={LABEL} htmlFor="pf-mother">
            Мать
          </label>
          <select
            id="pf-mother"
            className={SELECT}
            value={form.mother_id ?? ""}
            onChange={(e) => set("mother_id", numOrNull(e.target.value))}
          >
            <option value="">— не указана —</option>
            {mothers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={FORM_ROW}>
        <div className={FIELD}>
          <label className={LABEL} htmlFor="pf-teip">
            Тейп
          </label>
          <select
            id="pf-teip"
            className={SELECT}
            value={form.teip_id ?? ""}
            onChange={(e) => set("teip_id", numOrNull(e.target.value))}
          >
            <option value="">— не указан —</option>
            {teips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className={FIELD}>
          <label className={LABEL} htmlFor="pf-village">
            Село
          </label>
          <select
            id="pf-village"
            className={SELECT}
            value={form.village_id ?? ""}
            onChange={(e) => set("village_id", numOrNull(e.target.value))}
          >
            <option value="">— не указано —</option>
            {villages.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={FIELD}>
        <label className={LABEL} htmlFor="pf-note">
          Заметка
        </label>
        <textarea
          id="pf-note"
          className={INPUT + " min-h-[80px] resize-y"}
          value={form.note ?? ""}
          onChange={(e) => set("note", e.target.value || null)}
          placeholder="Дополнительные сведения (необязательно)"
        />
      </div>

      {localErr ? <p className={ERR_TEXT}>{localErr}</p> : null}

      <div className="mt-2 flex flex-wrap gap-3">
        <button type="submit" className={BTN_PRIMARY} disabled={busy}>
          {busy ? "Сохранение…" : submitLabel}
        </button>
        <button
          type="button"
          className={BTN_SECONDARY}
          onClick={onCancel}
          disabled={busy}
        >
          Отмена
        </button>
      </div>
    </form>
  );
}
