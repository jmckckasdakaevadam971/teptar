'use client';

import { useState } from 'react';

interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
}

/** Простая строка поиска по ФИО. */
export function SearchBar({ onSearch, placeholder }: SearchBarProps) {
  const [value, setValue] = useState('');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(value.trim());
      }}
      style={{ display: 'flex', gap: 8 }}
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder ?? 'Поиск по ФИО…'}
        style={{
          flex: 1,
          padding: '10px 14px',
          borderRadius: 10,
          border: '1px solid #cbd5e1',
          fontSize: 15,
        }}
      />
      <button type="submit" className="btn-primary">
        Найти
      </button>
    </form>
  );
}
