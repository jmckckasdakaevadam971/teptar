/**
 * Переиспользуемые наборы Tailwind-классов для общих UI-элементов.
 * Единый источник, чтобы не дублировать строки по компонентам.
 */

// Ссылка в шапке
export const NAV_LINK =
  'ml-[18px] text-[15px] tracking-[0.3px] text-cream/80 transition-colors hover:text-gold-light';

// Кнопка-ссылка (текстовая, золотая)
export const LINK_BTN =
  'cursor-pointer border-0 bg-transparent p-0 text-left text-[13px] text-gold transition-colors hover:text-gold-light hover:underline';

// Основная золотая кнопка
export const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-sm bg-gradient-to-b from-gold-light to-gold px-5 py-2.5 font-sans text-[15px] font-bold text-stone-900 shadow-gold transition hover:-translate-y-px hover:shadow-gold-lg disabled:cursor-not-allowed disabled:opacity-50 disabled:translate-y-0';

// Вторичная (контурная) кнопка
export const BTN_SECONDARY =
  'inline-flex items-center justify-center gap-2 rounded-sm border border-line-strong bg-gold/10 px-5 py-2.5 font-sans text-[15px] font-semibold text-gold-light transition hover:border-gold-soft hover:bg-gold/20';

// Неактивная кнопка-заглушка
export const BTN_DISABLED =
  'inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-sm bg-[#221b12] px-5 py-2.5 font-sans text-[15px] font-semibold text-[#6b6149]';

// Карточка с золотым акцентом (рамка + градиент)
export const ACCENT_CARD =
  'rounded border border-gold-soft bg-gradient-to-b from-gold/10 to-stone-900/90 p-[18px]';

// Поле ввода
export const INPUT =
  'w-full min-w-0 rounded-sm border border-line bg-stone-800 px-3.5 py-2.5 text-[15px] text-cream outline-none transition focus:border-gold-soft focus:ring-2 focus:ring-gold/30 placeholder:text-sand/70';

// Базовая карточка
export const CARD =
  'rounded border border-line bg-gradient-to-b from-stone-600/50 to-stone-800/85 p-[18px]';

// Подпись поля
export const LABEL = 'text-[13px] font-semibold text-sand';

// Поле формы (label + control)
export const FIELD = 'grid gap-1.5';

// Сетка формы
export const FORM_GRID = 'grid gap-4';

// Ряд полей формы
export const FORM_ROW =
  'grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3.5';

// Бейдж пола
const BADGE = 'rounded-full px-2.5 py-0.5 text-xs';
export const BADGE_M = `${BADGE} bg-blue-100 text-blue-800`;
export const BADGE_F = `${BADGE} bg-pink-100 text-pink-800`;

// Бейдж статуса видимости
const VIS_BADGE =
  'inline-block whitespace-nowrap rounded-full px-2.5 py-[5px] text-[13px] font-semibold';
export const VIS_PENDING = `${VIS_BADGE} bg-amber-100 text-amber-800`;
export const VIS_PUBLIC = `${VIS_BADGE} bg-green-100 text-green-800`;
export const VIS_REJECTED = `${VIS_BADGE} bg-red-100 text-red-800`;
export const VIS_PRIVATE = `${VIS_BADGE} bg-slate-100 text-slate-600`;

// Сегментированные вкладки
export const TABS = 'mb-[18px] inline-flex overflow-hidden rounded-[10px] border border-line';
export function tabBtn(active: boolean) {
  return `cursor-pointer border-0 px-5 py-2.5 text-[15px] transition-colors ${
    active
      ? 'bg-gradient-to-b from-gold-light to-gold font-bold text-stone-900'
      : 'bg-stone-800 text-cream hover:text-gold-light'
  }`;
}

// Компактный переключатель (фильтры)
export const TOGGLE = 'inline-flex overflow-hidden rounded-[10px] border border-line';
export function toggleBtn(active: boolean) {
  return `cursor-pointer border-0 px-4 py-2 text-sm transition-colors ${
    active
      ? 'bg-gradient-to-b from-gold-light to-gold font-bold text-stone-900'
      : 'bg-stone-800 text-cream hover:text-gold-light'
  }`;
}

// Чип справочника (тейп/село)
export const CHIP = 'rounded-lg border border-line bg-stone-700 px-3 py-2 text-sm text-cream';
export const CHIP_EXTINCT =
  'rounded-lg border border-[#5b2c25] bg-[#2a1714] px-3 py-2 text-sm text-[#e6c9c2]';

// Текст ошибки / успеха под формой
export const ERR_TEXT = 'mt-3 text-sm text-[#dc2626]';
export const OK_TEXT = 'mt-3 text-sm text-[#16a34a]';

// Таблица данных (admin / модерация)
export const TABLE_WRAP = 'overflow-x-auto';
export const TABLE =
  'w-full border-collapse text-sm [&_th]:border-b [&_th]:border-line [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-left [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-[0.04em] [&_th]:text-sand [&_td]:border-b [&_td]:border-line [&_td]:px-3 [&_td]:py-2.5 [&_td]:text-left [&_td]:text-cream [&_tbody_tr:hover]:bg-gold/[0.07]';

// Текстовая кнопка-ссылка (опасное действие)
export const LINK_DANGER =
  'cursor-pointer border-0 bg-transparent p-0 text-[13px] text-[#dc2626] transition hover:underline disabled:opacity-50';

// Выпадающий список роли
export const ROLE_SELECT =
  'cursor-pointer rounded-lg border border-line bg-stone-800 px-2.5 py-1.5 text-sm text-cream disabled:cursor-not-allowed disabled:opacity-60';
