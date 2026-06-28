'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { canModerate, useAuth } from '@/lib/auth';
import type { Gender, Person, Teip, Village } from '@/lib/types';
import { PersonPicker, type PersonRef } from '@/components/PersonPicker/PersonPicker';
import { BTN_PRIMARY, BTN_SECONDARY, FIELD, FORM_GRID, FORM_ROW, INPUT, LABEL, LINK_BTN } from '@/lib/ui';

interface PersonFormProps {
  mode: 'create' | 'edit';
  /** Начальные значения (для редактирования). */
  initial?: Partial<Person>;
  /** Жёстко заданный отец (при добавлении сына/дочери). */
  lockedFather?: PersonRef | null;
  onSaved: (person: Person) => void;
  submitLabel?: string;
}

/**
 * Универсальная форма создания и редактирования персоны.
 * Указание отца/матери привязывает человека к древу.
 */
export function PersonForm({ mode, initial, lockedFather, onSaved, submitLabel }: PersonFormProps) {
  const { user } = useAuth();

  const [fullName, setFullName] = useState(initial?.full_name ?? '');
  const [gender, setGender] = useState<Gender>(initial?.gender ?? 'm');
  const [birthYear, setBirthYear] = useState(initial?.birth_year?.toString() ?? '');
  const [deathYear, setDeathYear] = useState(initial?.death_year?.toString() ?? '');
  const [teipId, setTeipId] = useState(initial?.teip_id?.toString() ?? '');
  const [villageId, setVillageId] = useState(initial?.village_id?.toString() ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [father, setFather] = useState<PersonRef | null>(lockedFather ?? null);
  const [mother, setMother] = useState<PersonRef | null>(null);

  const [teips, setTeips] = useState<Teip[]>([]);
  const [villages, setVillages] = useState<Village[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Добавление нового села прямо из формы (для админов).
  const [newVillage, setNewVillage] = useState('');
  const [newDistrict, setNewDistrict] = useState('');
  const [showNewVillage, setShowNewVillage] = useState(false);

  // Справочники + подгрузка имён родителей при редактировании.
  useEffect(() => {
    api.teips.list().then(setTeips).catch(() => undefined);
    api.villages.list().then(setVillages).catch(() => undefined);
  }, []);

  // Тейпы, сгруппированные по тукхуму (для optgroup).
  const teipsByTukhum = useMemo(() => {
    const groups = new Map<string, Teip[]>();
    for (const t of teips) {
      const key = t.tukhum_name ?? 'Прочие';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ru'));
  }, [teips]);

  useEffect(() => {
    if (lockedFather) {
      setFather(lockedFather);
      return;
    }
    if (mode === 'edit' && initial?.father_id) {
      api.persons
        .get(initial.father_id)
        .then((p) => setFather({ id: p.id, full_name: p.full_name }))
        .catch(() => undefined);
    }
    if (mode === 'edit' && initial?.mother_id) {
      api.persons
        .get(initial.mother_id)
        .then((p) => setMother({ id: p.id, full_name: p.full_name }))
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedFather, mode, initial?.father_id, initial?.mother_id]);

  async function addVillage() {
    const name = newVillage.trim();
    if (name.length < 2) return;
    try {
      const v = await api.villages.create(name, newDistrict.trim() || null);
      setVillages((prev) => [...prev, v].sort((a, b) => a.name.localeCompare(b.name)));
      setVillageId(String(v.id));
      setNewVillage('');
      setNewDistrict('');
      setShowNewVillage(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось добавить село');
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (fullName.trim().length < 2) {
      setError('Укажите ФИО (минимум 2 символа)');
      return;
    }
    const by = birthYear ? Number(birthYear) : null;
    const dy = deathYear ? Number(deathYear) : null;
    if (by !== null && dy !== null && dy < by) {
      setError('Год смерти не может быть раньше года рождения');
      return;
    }

    const payload: Partial<Person> = {
      full_name: fullName.trim(),
      gender,
      birth_year: by,
      death_year: dy,
      teip_id: teipId ? Number(teipId) : null,
      village_id: villageId ? Number(villageId) : null,
      note: note.trim() || null,
      father_id: father?.id ?? null,
      mother_id: mother?.id ?? null,
    };

    setSaving(true);
    try {
      const saved =
        mode === 'create'
          ? await api.persons.create(payload)
          : await api.persons.update(initial!.id as number, payload);
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={FORM_GRID} onSubmit={handleSubmit}>
      <div className={FIELD}>
        <label className={LABEL}>ФИО *</label>
        <input
          className={INPUT}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Например, Магомед Ахмадович"
          autoFocus
        />
      </div>

      <div className={FORM_ROW}>
        <div className={FIELD}>
          <label className={LABEL}>Пол</label>
          <select className={INPUT} value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
            <option value="m">муж.</option>
            <option value="f">жен.</option>
          </select>
        </div>
        <div className={FIELD}>
          <label className={LABEL}>Год рождения</label>
          <input
            className={INPUT}
            type="number"
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value)}
            placeholder="1940"
          />
        </div>
        <div className={FIELD}>
          <label className={LABEL}>Год смерти</label>
          <input
            className={INPUT}
            type="number"
            value={deathYear}
            onChange={(e) => setDeathYear(e.target.value)}
            placeholder="пусто — если жив"
          />
        </div>
      </div>

      <div className={FORM_ROW}>
        <div className={FIELD}>
          <label className={LABEL}>Тейп</label>
          <select className={INPUT} value={teipId} onChange={(e) => setTeipId(e.target.value)}>
            <option value="">— не указан —</option>
            {teipsByTukhum.map(([tukhum, list]) => (
              <optgroup key={tukhum} label={tukhum}>
                {list.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className={FIELD}>
          <label className={LABEL}>Населённый пункт</label>
          <select className={INPUT} value={villageId} onChange={(e) => setVillageId(e.target.value)}>
            <option value="">— не указан —</option>
            {villages.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.district ? ` (${v.district})` : ''}
                {!v.is_extant ? ' — нежилое' : ''}
              </option>
            ))}
          </select>
          {canModerate(user?.role) &&
            (showNewVillage ? (
              <div className="mt-2 flex gap-2">
                <input
                  className={INPUT}
                  value={newVillage}
                  placeholder="Новое село"
                  onChange={(e) => setNewVillage(e.target.value)}
                />
                <input
                  className={INPUT}
                  value={newDistrict}
                  placeholder="Район"
                  onChange={(e) => setNewDistrict(e.target.value)}
                />
                <button type="button" className={BTN_SECONDARY} onClick={addVillage}>
                  ОК
                </button>
              </div>
            ) : (
              <button type="button" className={LINK_BTN} onClick={() => setShowNewVillage(true)}>
                + добавить село
              </button>
            ))}
        </div>
      </div>

      <PersonPicker
        label="Отец"
        value={father}
        onChange={setFather}
        excludeId={initial?.id}
        placeholder="Найти отца по ФИО…"
      />
      <PersonPicker
        label="Мать"
        value={mother}
        onChange={setMother}
        excludeId={initial?.id}
        placeholder="Найти мать по ФИО…"
      />

      <div className={FIELD}>
        <label className={LABEL}>Примечание</label>
        <textarea
          className={`${INPUT} resize-y`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Биография, источник сведений и т.п."
        />
      </div>

      {error && <p className="m-0 text-red-600">{error}</p>}

      <button type="submit" className={BTN_PRIMARY} disabled={saving}>
        {saving ? 'Сохранение…' : submitLabel ?? (mode === 'create' ? 'Создать' : 'Сохранить')}
      </button>
    </form>
  );
}
