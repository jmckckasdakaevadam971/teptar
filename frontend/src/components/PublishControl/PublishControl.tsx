'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  ERR_TEXT,
  OK_TEXT,
  VIS_PENDING,
  VIS_PRIVATE,
  VIS_PUBLIC,
  VIS_REJECTED,
} from '@/lib/ui';
import type { TreeStatus } from '@/lib/types';

const CUTOFF = 1970;

// Карточка-акцент (золотая рамка/градиент) для блока видимости.
const VIS_CARD =
  'rounded border border-gold-soft bg-gradient-to-b from-gold/10 to-stone-900/90 p-[18px]';

/**
 * Управление видимостью своего древа.
 * Личное (private) ⇄ общая база (public, через модерацию).
 * При публикации пользователь выбирает: показывать всех
 * или скрыть родившихся с 1970 года.
 */
export function PublishControl() {
  const [status, setStatus] = useState<TreeStatus | null>(null);
  const [mode, setMode] = useState<'all' | 'hide_recent'>('hide_recent');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await api.persons.treeStatus());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить статус древа');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function publish() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await api.persons.publish(mode, CUTOFF);
      setNotice(
        mode === 'hide_recent'
          ? `Отправлено на модерацию: ${r.published}. Скрыто (с ${CUTOFF} г.): ${r.hidden}.`
          : `Отправлено на модерацию: ${r.published}.`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось опубликовать');
    } finally {
      setBusy(false);
    }
  }

  async function unpublish() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.persons.unpublish();
      setNotice('Древо снова видно только вам.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось скрыть');
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return error ? (
      <div className={VIS_CARD}>
        <p className="m-0 text-sm text-[#dc2626]">{error}</p>
      </div>
    ) : null;
  }

  if (status.total === 0) return null;

  const inBase =
    status.state === 'pending' || status.state === 'published' || status.state === 'mixed';

  let badge: { cls: string; text: string };
  if (status.state === 'pending') {
    badge = { cls: VIS_PENDING, text: '⏳ На модерации' };
  } else if (status.state === 'published') {
    badge = { cls: VIS_PUBLIC, text: '🌍 В общей базе' };
  } else if (status.state === 'mixed') {
    badge = { cls: VIS_PUBLIC, text: '🌍 Частично в общей базе' };
  } else if (status.rejected > 0) {
    badge = { cls: VIS_REJECTED, text: '✖ Отклонено модератором' };
  } else {
    badge = { cls: VIS_PRIVATE, text: '🔒 Только у меня' };
  }

  return (
    <div className={VIS_CARD}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="m-0 text-lg font-semibold text-cream">Видимость древа</h3>
          <p className="mt-1 max-w-[46ch] text-sm text-sand">
            {inBase
              ? 'Ваше древо доступно в общей базе — другие могут найти общих предков.'
              : 'Сейчас древо личное. Опубликуйте его, чтобы поделиться с другими.'}
          </p>
        </div>
        <span className={badge.cls}>{badge.text}</span>
      </div>

      {error && <p className={ERR_TEXT}>{error}</p>}
      {notice && <p className={OK_TEXT}>{notice}</p>}

      {inBase ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={BTN_SECONDARY} onClick={() => void unpublish()} disabled={busy}>
            {busy ? 'Скрываю…' : '🔒 Убрать из общей базы'}
          </button>
        </div>
      ) : (
        <>
          <fieldset className="mt-4 grid gap-2.5 border-0 p-0 sm:grid-cols-2" disabled={busy}>
            <label
              className={`flex cursor-pointer items-start gap-2.5 rounded-xl border-[1.5px] p-3.5 transition-colors hover:border-gold ${
                mode === 'hide_recent' ? 'border-gold bg-gold/10' : 'border-line'
              }`}
            >
              <input
                type="radio"
                name="vis-mode"
                className="mt-[3px] accent-[#1b5e20]"
                checked={mode === 'hide_recent'}
                onChange={() => setMode('hide_recent')}
              />
              <span className="flex flex-col gap-0.5">
                <b className="text-[15px] text-cream">Скрыть живущих</b>
                <small className="text-[13px] leading-[1.35] text-sand">
                  В базе видны только предки до {CUTOFF} г. Родившиеся позже остаются личными.
                </small>
              </span>
            </label>
            <label
              className={`flex cursor-pointer items-start gap-2.5 rounded-xl border-[1.5px] p-3.5 transition-colors hover:border-gold ${
                mode === 'all' ? 'border-gold bg-gold/10' : 'border-line'
              }`}
            >
              <input
                type="radio"
                name="vis-mode"
                className="mt-[3px] accent-[#1b5e20]"
                checked={mode === 'all'}
                onChange={() => setMode('all')}
              />
              <span className="flex flex-col gap-0.5">
                <b className="text-[15px] text-cream">Показывать всех</b>
                <small className="text-[13px] leading-[1.35] text-sand">
                  В общей базе будет всё древо, включая ныне живущих.
                </small>
              </span>
            </label>
          </fieldset>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={BTN_PRIMARY} onClick={() => void publish()} disabled={busy}>
              {busy ? 'Отправляю…' : '🌍 Отправить в общую базу'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
