'use client';

import { api } from '@/lib/api';

interface ExportButtonsProps {
  personId: number;
}

/** Кнопки экспорта дерева. CSV открывается в Excel, Visio-CSV — в Data Visualizer. */
export function ExportButtons({ personId }: ExportButtonsProps) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <a className="btn-secondary" href={api.exportTreeUrl(personId, 'csv')}>
        ⬇ Excel (CSV)
      </a>
      <a className="btn-secondary" href={api.exportTreeUrl(personId, 'visio')}>
        ⬇ Для Visio
      </a>
      <span className="btn-disabled" title="Появится на этапе 4 (нужен Puppeteer)">
        PDF — скоро
      </span>
    </div>
  );
}
