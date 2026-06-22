'use client';

import { CommonAncestorWidget } from '@/features/commonAncestor/CommonAncestorWidget';

/**
 * Страница «Родство» — узнать, кем приходятся друг другу два человека.
 * Люди выбираются по имени, ID вводить не нужно.
 */
export default function RelativesPage() {
  return (
    <div style={{ display: 'grid', gap: 20, maxWidth: 720, margin: '0 auto' }}>
      <div>
        <h1>Кем мы родственники?</h1>
        <p style={{ color: 'var(--muted)', marginTop: 0 }}>
          Выберите двух человек из общей базы — Vorhda найдёт их ближайшего общего
          предка и определит степень родства.
        </p>
      </div>

      <CommonAncestorWidget title="Найти общего предка" />

      <div className="card rel-tip">
        <h3 style={{ marginTop: 0 }}>Как это работает</h3>
        <ul className="rel-steps">
          <li>Найдите и выберите первого человека по фамилии и имени.</li>
          <li>То же для второго.</li>
          <li>Нажмите «Узнать родство» — увидите общего предка и степень.</li>
        </ul>
        <p style={{ color: 'var(--muted)', margin: 0, fontSize: 14 }}>
          В поиске доступны люди из общей базы и из вашего личного древа.
        </p>
      </div>
    </div>
  );
}
