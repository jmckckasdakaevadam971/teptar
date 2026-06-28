'use client';

import { CommonAncestorWidget } from '@/features/commonAncestor/CommonAncestorWidget';
import { CARD } from '@/lib/ui';

/**
 * Страница «Родство» — узнать, кем приходятся друг другу два человека.
 * Люди выбираются по имени, ID вводить не нужно.
 */
export default function RelativesPage() {
  return (
    <div className="mx-auto grid max-w-[720px] gap-5">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-cream">Кем мы родственники?</h1>
        <p className="mt-0 text-sand">
          Выберите двух человек из общей базы — Vorhda найдёт их ближайшего общего
          предка и определит степень родства.
        </p>
      </div>

      <CommonAncestorWidget title="Найти общего предка" />

      <div className={`${CARD} mt-[18px]`}>
        <h3 className="mt-0 text-lg font-semibold text-cream">Как это работает</h3>
        <ul className="mt-3 list-disc pl-5 leading-[1.9] text-cream marker:text-gold">
          <li>Найдите и выберите первого человека по фамилии и имени.</li>
          <li>То же для второго.</li>
          <li>Нажмите «Узнать родство» — увидите общего предка и степень.</li>
        </ul>
        <p className="m-0 text-sm text-sand">
          В поиске доступны люди из общей базы и из вашего личного древа.
        </p>
      </div>
    </div>
  );
}
