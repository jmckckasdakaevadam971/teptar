'use client';

import { api } from '@/lib/api';
import { BTN_DISABLED, BTN_SECONDARY } from '@/lib/ui';

interface ExportButtonsProps {
  personId: number;
}

/** Кнопки экспорта дерева. CSV открывается в Excel, Visio-CSV — в Data Visualizer. */
export function ExportButtons({ personId }: ExportButtonsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <a className={BTN_SECONDARY} href={api.exportTreeUrl(personId, 'csv')}>
        ⬇ Excel (CSV)
      </a>
      <a className={BTN_SECONDARY} href={api.exportTreeUrl(personId, 'visio')}>
        ⬇ Для Visio
      </a>
      <span className={BTN_DISABLED} title="Появится на этапе 4 (нужен Puppeteer)">
        PDF — скоро
      </span>
    </div>
  );
}
