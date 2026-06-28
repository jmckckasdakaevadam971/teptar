'use client';

import { useState } from 'react';
import { BTN_PRIMARY, INPUT } from '@/lib/ui';

interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
}

/** Простая строка поиска по ФИО. */
export function SearchBar({ onSearch, placeholder }: SearchBarProps) {
  const [value, setValue] = useState('');

  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(value.trim());
      }}
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder ?? 'Поиск по ФИО…'}
        className={`${INPUT} flex-1`}
      />
      <button type="submit" className={BTN_PRIMARY}>
        Найти
      </button>
    </form>
  );
}
