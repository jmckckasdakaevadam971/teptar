'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import type { Person } from '@/lib/types';

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
      <div className="field">
        <label>{label}</label>
        <div className="picker-selected">
          <span>
            {value.full_name} <span style={{ color: '#94a3b8' }}>#{value.id}</span>
          </span>
          <button type="button" className="link-btn" onClick={() => onChange(null)}>
            убрать
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="field" style={{ position: 'relative' }}>
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="input"
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
        <button type="button" className="btn-secondary" onClick={search} disabled={loading}>
          {loading ? '…' : 'Найти'}
        </button>
      </div>

      {open && (
        <div className="picker-list">
          {results.length === 0 && <div className="picker-empty">Ничего не найдено</div>}
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              className="picker-item"
              onClick={() => {
                onChange({ id: p.id, full_name: p.full_name });
                setOpen(false);
                setQ('');
              }}
            >
              {p.full_name}
              <span style={{ color: '#94a3b8', marginLeft: 6 }}>
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
