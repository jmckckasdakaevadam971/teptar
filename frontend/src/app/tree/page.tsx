'use client';

import { useState } from 'react';

/** Простой переход к древу человека по его ID. */
export default function TreePage() {
  const [id, setId] = useState('');

  return (
    <div className="card" style={{ maxWidth: 460 }}>
      <h1>Древо по ID</h1>
      <p style={{ color: '#64748b' }}>
        Введите ID человека, чтобы открыть его генеалогическое древо.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="input"
          placeholder="Например, 1"
          value={id}
          onChange={(e) => setId(e.target.value)}
        />
        <button
          className="btn-primary"
          disabled={!id}
          onClick={() => (window.location.href = `/person/${id}`)}
        >
          Открыть
        </button>
      </div>
    </div>
  );
}
