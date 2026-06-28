'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import type { Person } from '@/lib/types';
import { BTN_SECONDARY, FIELD, INPUT, LABEL, LINK_BTN } from '@/lib/ui';

export interface PersonRef {
  id: number;
  full_name: string;
}

interface PersonPickerProps {
  label: string;
  value: PersonRef | null;
  onChange: (p: PersonRef | null) => void;
  /** Исключить из результатов (например, саму редактируемую персону). */
  excludeId?: number;
  placeholder?: string;
}

/**
 * Поиск и выбор существующей персоны по ФИО.
 * Используется в форме для указания отца/матери — это и есть «привязка к древу».
 */
export function PersonPicker({ label, value, onChange, excludeId, placeholder }: PersonPickerProps) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Person[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function search() {
    const term = q.trim();
    if (term.length < 1) return;
    setLoading(true);
    try {
      const found = await api.persons.search({ q: term });
      setResults(excludeId ? found.filter((p) => p.id !== excludeId) : found);
      setOpen(true);
    } catch {
      setResults([]);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }

  if (value) {
    return (
      <div className={FIELD}>
        <label className={LABEL}>{label}</label>
        <div className="flex items-center justify-between rounded-[10px] border border-line bg-stone-700 px-3.5 py-2.5">
          <span className="text-cream">
            {value.full_name} <span className="text-sand/60">#{value.id}</span>
          </span>
          <button type="button" className={LINK_BTN} onClick={() => onChange(null)}>
            убрать
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${FIELD} relative`}>
      <label className={LABEL}>{label}</label>
      <div className="flex gap-2">
        <input
          className={`${INPUT} flex-1`}
          value={q}
          placeholder={placeholder ?? 'Поиск по ФИО…'}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              search();
            }
          }}
        />
        <button type="button" className={BTN_SECONDARY} onClick={search} disabled={loading}>
          {loading ? '…' : 'Найти'}
        </button>
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-[10px] border border-line bg-stone-800 shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
          {results.length === 0 && <div className="px-3.5 py-3 text-sm text-sand">Ничего не найдено</div>}
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              className="block w-full cursor-pointer border-0 bg-transparent px-3.5 py-2.5 text-left text-sm text-cream hover:bg-gold/15"
              onClick={() => {
                onChange({ id: p.id, full_name: p.full_name });
                setOpen(false);
                setQ('');
              }}
            >
              {p.full_name}
              <span className="ml-1.5 text-sand/60">
                {p.birth_year ?? '?'}
                {p.death_year ? `–${p.death_year}` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
