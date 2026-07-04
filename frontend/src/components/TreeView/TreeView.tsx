"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import {
  ChevronUp,
  Crosshair,
  Download,
  Info,
  Maximize2,
  Minimize2,
  Minus,
  MoreVertical,
  Move,
  Pencil,
  Plus,
  Trash2,
  Undo2,
} from "lucide-react";
import type { Person } from "@/lib/demo-data";
import { getSpouses, isFemale } from "@/lib/demo-data";
import { cn } from "@/lib/utils";

// размеры узла и отступы для древовидной раскладки (карточки ФИКСИРОВАННОГО размера)
const NODE_W = 176; // w-44
const NODE_H = 116; // вмещает имя в 2 строки + годы
const H_GAP = 24;
const V_GAP = 72;
const SLOT = NODE_W + H_GAP;
const ROW_PITCH = NODE_H + V_GAP;
// вертикальный шаг карточек в стопке листьев (дети без потомков)
const STACK_PITCH = NODE_H + 56;

// Палитра цветов ветвей на выбор пользователя: приглушённые тона,
// различимые на тёмном фоне и не спорящие с золотой темой.
const BRANCH_PALETTE = [
  "#5da9a2", // бирюзовый
  "#7f9ccb", // голубой
  "#a58fd0", // лавандовый
  "#c77e94", // розовый
  "#8fb573", // зелёный
  "#cf8f5a", // медный
  "#6fb3c9", // циан
  "#b3b264", // оливковый
];

/** Итоговый цвет каждого узла: собственный branchColor или ближайшего
 *  предка. Считается по полному древу — не зависит от свёрнутых ветвей. */
function computeBranchColors(people: Person[]): Map<string, string> {
  const byId = new Map(people.map((p) => [p.id, p]));
  const colors = new Map<string, string>();
  const resolve = (p: Person, guard: Set<string>): string | undefined => {
    if (colors.has(p.id)) return colors.get(p.id);
    if (guard.has(p.id)) return undefined; // защита от цикла в parentId
    guard.add(p.id);
    const color =
      p.branchColor ??
      (p.parentId ? resolve(byId.get(p.parentId) ?? p, guard) : undefined);
    if (color) colors.set(p.id, color);
    return color;
  };
  for (const p of people) resolve(p, new Set());
  return colors;
}

/** Плейсхолдер «добавить родственника» рядом с выбранным узлом. */
type AddRelation = "father" | "wife" | "son" | "daughter";
const ADD_LABEL: Record<AddRelation, string> = {
  father: "Отец",
  wife: "Жена",
  son: "Сын",
  daughter: "Дочь",
};

// Уголковый коннектор: вертикаль от родителя к шине, горизонтальная шина
// и вертикали к каждому ребёнку.
type Connector = {
  pid: string; // id родителя — спуск/шина красятся в цвет его ветви
  px: number; // центр родителя по X
  py: number; // низ родителя по Y
  busY: number; // высота горизонтальной шины
  minX: number;
  maxX: number;
  // спуски к детям; линия входа красится в цвет ветви самого ребёнка
  children: { id: string; x: number; topY: number }[];
  // хребет стопки листьев и отводы к карточкам: произвольные отрезки;
  // cid — id ребёнка для отводов (хребет принадлежит ветви родителя)
  extra: { x1: number; y1: number; x2: number; y2: number; cid?: string }[];
};

/** Чистая древовидная раскладка: каждый родитель центрируется над детьми.
 *  Дети БЕЗ потомков (листья) складываются вертикальной стопкой в одну
 *  колонку — иначе широкие семьи растягивают древо по горизонтали.
 *  Жёны занимают собственные слоты справа от мужа (карточки-сателлиты).
 *  Вынесена из компонента, чтобы PNG-экспорт мог построить раскладку
 *  ПОЛНОГО древа независимо от свёрнутых ветвей. */
function computeTreeLayout(people: Person[], editable: boolean) {
  const idSet = new Set(people.map((p) => p.id));
  const childrenMap = new Map<string, Person[]>();
  const roots: Person[] = [];
  for (const p of people) {
    if (p.parentId && idSet.has(p.parentId)) {
      const arr = childrenMap.get(p.parentId) ?? [];
      arr.push(p);
      childrenMap.set(p.parentId, arr);
    } else {
      roots.push(p);
    }
  }

  const pos: Record<string, { x: number; y: number }> = {};
  if (!people.length) return { pos, width: NODE_W, height: NODE_H };

  const minGen = Math.min(...people.map((p) => p.generation));
  let cursor = 0;

  const hasKids = (p: Person) => (childrenMap.get(p.id)?.length ?? 0) > 0;

  // дети раскладываются справа налево: первый добавленный — правее
  const place = (node: Person): number => {
    const kids = childrenMap.get(node.id);
    // узел с жёнами занимает 1 + N слотов (карточки жён — справа)
    const unitSlots = 1 + getSpouses(node).length;
    let x: number;
    if (!kids || kids.length === 0) {
      x = cursor * SLOT;
      cursor += unitSlots;
    } else {
      // листья семьи — одной вертикальной стопкой в одну колонку
      const leaves = kids.filter((k) => !hasKids(k));
      const xs: number[] = [];
      let stackPlaced = false;
      for (const kid of [...kids].reverse()) {
        if (!hasKids(kid)) {
          if (stackPlaced) continue;
          stackPlaced = true;
          const stackX = cursor * SLOT;
          // колонка стопки резервирует место под жён самого «жёнистого» листа
          const stackSlots =
            1 + Math.max(...leaves.map((l) => getSpouses(l).length));
          leaves.forEach((leaf, i) => {
            pos[leaf.id] = {
              x: stackX,
              y: (leaf.generation - minGen) * ROW_PITCH + i * STACK_PITCH,
            };
          });
          cursor += stackSlots;
          xs.push(stackX);
        } else {
          xs.push(place(kid));
        }
      }
      x = (Math.min(...xs) + Math.max(...xs)) / 2;
      // карточки жён торчат вправо — сдвигаем курсор, чтобы следующая
      // ветвь не наехала на них
      cursor = Math.max(cursor, x / SLOT + unitSlots);
    }
    pos[node.id] = { x, y: (node.generation - minGen) * ROW_PITCH };
    return x;
  };
  [...roots].reverse().forEach(place);

  // Ручные смещения: пользователь перетащил карточку или целую ветвь.
  let shiftX = 0;
  let shiftY = 0;
  for (const p of people) {
    const q = pos[p.id];
    if (!q) continue;
    q.x += p.offsetX ?? 0;
    q.y += p.offsetY ?? 0;
    shiftX = Math.min(shiftX, q.x);
    shiftY = Math.min(shiftY, q.y);
  }
  // Ничего не уводим в минус — возвращаем древо в видимую область.
  if (shiftX < 0 || shiftY < 0) {
    for (const key of Object.keys(pos)) {
      pos[key].x -= Math.min(shiftX, 0);
      pos[key].y -= Math.min(shiftY, 0);
    }
  }

  // Габариты по фактическим позициям (включая карточки жён справа).
  let width = cursor > 0 ? (cursor - 1) * SLOT + NODE_W : NODE_W;
  let height = NODE_H;
  for (const p of people) {
    const q = pos[p.id];
    if (!q) continue;
    width = Math.max(width, q.x + NODE_W + getSpouses(p).length * SLOT);
    height = Math.max(height, q.y + NODE_H);
  }

  // Запас по краям под плейсхолдеры «+» (отец сверху, жена справа, дети снизу).
  if (editable) {
    for (const key of Object.keys(pos)) {
      pos[key] = { x: pos[key].x + SLOT, y: pos[key].y + ROW_PITCH };
    }
    width += 2 * SLOT;
    height += 2 * ROW_PITCH;
  }
  return { pos, width, height };
}

/** Позиции карточек жён: подряд справа от карточки мужа. */
function wifeCardsOf(
  person: Person,
  p: { x: number; y: number },
): { name: string; x: number; y: number }[] {
  return getSpouses(person).map((name, i) => ({
    name,
    x: p.x + SLOT * (i + 1),
    y: p.y,
  }));
}

/** Строит связи родитель → дети по готовой раскладке.
 *  Дети, лежащие в одной колонке (стопка листьев), подключаются через
 *  вертикальный «хребет» слева от карточек с отводом к каждой — так стопка
 *  читается как братья/сёстры, а не как цепочка поколений.
 *  Используется и интерактивным SVG, и PNG-экспортом. */
function buildConnectors(
  people: Person[],
  pos: Record<string, { x: number; y: number }>,
  bottomOf: (id: string) => number,
): Connector[] {
  const byParent = new Map<string, Person[]>();
  for (const person of people) {
    if (!person.parentId) continue;
    const arr = byParent.get(person.parentId) ?? [];
    arr.push(person);
    byParent.set(person.parentId, arr);
  }

  const result: Connector[] = [];
  byParent.forEach((kids, parentId) => {
    const pPos = pos[parentId];
    if (!pPos) return;
    const px = pPos.x + NODE_W / 2;
    const py = pPos.y + bottomOf(parentId);

    // группируем детей по колонке X: колонка с несколькими — стопка листьев
    const cols = new Map<
      number,
      { id: string; topY: number; midY: number }[]
    >();
    for (const kid of kids) {
      const cPos = pos[kid.id];
      if (!cPos) continue;
      const arr = cols.get(cPos.x) ?? [];
      arr.push({ id: kid.id, topY: cPos.y, midY: cPos.y + NODE_H / 2 });
      cols.set(cPos.x, arr);
    }
    if (!cols.size) return;

    let topMin = Infinity;
    cols.forEach((list) => {
      list.sort((a, b) => a.topY - b.topY);
      topMin = Math.min(topMin, list[0].topY);
    });
    const busY = py + (topMin - py) / 2;

    const children: { id: string; x: number; topY: number }[] = [];
    const extra: {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      cid?: string;
    }[] = [];
    const busXs = [px];
    cols.forEach((list, colX) => {
      if (list.length === 1) {
        children.push({
          id: list[0].id,
          x: colX + NODE_W / 2,
          topY: list[0].topY,
        });
        busXs.push(colX + NODE_W / 2);
      } else {
        const spineX = colX - 14;
        busXs.push(spineX);
        extra.push({
          x1: spineX,
          y1: busY,
          x2: spineX,
          y2: list[list.length - 1].midY,
        });
        for (const item of list) {
          extra.push({
            x1: spineX,
            y1: item.midY,
            x2: colX + 2,
            y2: item.midY,
            cid: item.id,
          });
        }
      }
    });
    result.push({
      pid: parentId,
      px,
      py,
      busY,
      minX: Math.min(...busXs),
      maxX: Math.max(...busXs),
      children,
      extra,
    });
  });
  return result;
}

export function TreeView({
  people,
  selectedId,
  onSelect,
  onAddRelative,
  onShowInfo,
  onEdit,
  onDelete,
  onSetColor,
  onMove,
  onResetPos,
  onWifeInfo,
  onWifeEdit,
  onWifeDelete,
}: {
  people: Person[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Если передан — вокруг выбранного узла появляются «+» для добавления родных. */
  onAddRelative?: (rel: AddRelation) => void;
  /** Если передан — на карточках появляется бургер-меню с пунктом «Информация». */
  onShowInfo?: (id: string) => void;
  /** Если передан — в бургер-меню карточки появляется пункт «Редактировать». */
  onEdit?: (id: string) => void;
  /** Если передан — в бургер-меню карточки появляется пункт «Удалить». */
  onDelete?: (id: string) => void;
  /** Если передан — в бургер-меню появляется пункт «Цвет ветви»:
   *  цвет применяется к человеку и его потомкам, null — сбросить. */
  onSetColor?: (id: string, color: string | null) => void;
  /** Если передан — карточки можно перетаскивать мышкой. ids — кого двигаем
   *  (ветвь или одна карточка), dx/dy — смещение в координатах раскладки. */
  onMove?: (ids: string[], dx: number, dy: number) => void;
  /** Сброс ручного смещения ветви: сама карточка + все её потомки. */
  onResetPos?: (ids: string[]) => void;
  /** Если передан — на карточках жён появляется бургер-меню с пунктом «Информация».
   *  wifeIndex — позиция жены в списке getSpouses(person). */
  onWifeInfo?: (personId: string, wifeIndex: number) => void;
  /** Пункт «Редактировать» в бургер-меню карточки жены. */
  onWifeEdit?: (personId: string, wifeIndex: number) => void;
  /** Пункт «Удалить» в бургер-меню карточки жены. */
  onWifeDelete?: (personId: string, wifeIndex: number) => void;
}) {
  const editable = Boolean(onAddRelative);
  const movable = Boolean(onMove);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  // какая карточка держит открытым бургер-меню
  const [menuId, setMenuId] = useState<string | null>(null);
  // палитра «цвет ветви», открытая кликом по линии: чью ветвь красим и где
  const [linePicker, setLinePicker] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  // live-перетаскивание: кого тянем и на сколько (до отпускания мыши)
  const [drag, setDrag] = useState<{
    ids: Set<string>;
    dx: number;
    dy: number;
  } | null>(null);
  // что тянуть за карточку: всю ветвь или только её саму
  const [dragMode, setDragMode] = useState<"branch" | "single">("branch");
  // свёрнутые ветви: id узлов, чьи потомки скрыты
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Число потомков каждого узла (для счётчика на кнопке свёрнутой ветви).
  const descendantCount = useMemo(() => {
    const kidsMap = new Map<string, Person[]>();
    for (const p of people) {
      if (!p.parentId) continue;
      const arr = kidsMap.get(p.parentId) ?? [];
      arr.push(p);
      kidsMap.set(p.parentId, arr);
    }
    const memo = new Map<string, number>();
    const count = (id: string): number => {
      const cached = memo.get(id);
      if (cached !== undefined) return cached;
      const kids = kidsMap.get(id) ?? [];
      const total = kids.reduce((sum, k) => sum + 1 + count(k.id), 0);
      memo.set(id, total);
      return total;
    };
    for (const p of people) count(p.id);
    return memo;
  }, [people]);

  // Люди видимой части древа: потомки свёрнутых узлов скрыты.
  const visiblePeople = useMemo(() => {
    if (!collapsed.size) return people;
    const idSet = new Set(people.map((p) => p.id));
    const hidden = new Set<string>();
    // узел скрыт, если какой-то из его предков свёрнут
    const isHidden = (p: Person): boolean => {
      if (hidden.has(p.id)) return true;
      let cur = p;
      while (cur.parentId && idSet.has(cur.parentId)) {
        if (collapsed.has(cur.parentId)) {
          hidden.add(p.id);
          return true;
        }
        const parent = people.find((q) => q.id === cur.parentId);
        if (!parent) break;
        cur = parent;
      }
      return false;
    };
    return people.filter((p) => !isHidden(p));
  }, [people, collapsed]);

  // Итоговые цвета ветвей (наследуются от предка) — по полному древу
  const branchColors = useMemo(() => computeBranchColors(people), [people]);

  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // клик в любом месте вне меню/палитры — закрыть их
  useEffect(() => {
    if (!menuId && !linePicker) return;
    const close = () => {
      setMenuId(null);
      setLinePicker(null);
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuId, linePicker]);

  // раскладка видимой части древа (свёрнутые ветви исключены)
  const layout = useMemo(
    () => computeTreeLayout(visiblePeople, editable),
    [visiblePeople, editable],
  );

  // позиции для отрисовки: во время перетаскивания смещаем захваченные карточки
  const displayPos = useMemo(() => {
    if (!drag) return layout.pos;
    const out: Record<string, { x: number; y: number }> = {};
    for (const key of Object.keys(layout.pos)) {
      const q = layout.pos[key];
      out[key] = drag.ids.has(key)
        ? { x: q.x + drag.dx, y: q.y + drag.dy }
        : q;
    }
    return out;
  }, [layout, drag]);

  // id ветви: сам человек + все его потомки (по полному древу)
  const collectBranch = useCallback(
    (rootId: string): string[] => {
      const kids = new Map<string, string[]>();
      for (const p of people) {
        if (!p.parentId) continue;
        const arr = kids.get(p.parentId) ?? [];
        arr.push(p.id);
        kids.set(p.parentId, arr);
      }
      const ids: string[] = [];
      const stack = [rootId];
      while (stack.length) {
        const id = stack.pop()!;
        ids.push(id);
        for (const k of kids.get(id) ?? []) stack.push(k);
      }
      return ids;
    },
    [people],
  );

  const selected = people.find((p) => p.id === selectedId) ?? null;

  // Слоты «добавить родственника» вокруг выбранного узла (Familio-стиль).
  const addSlots = useMemo(() => {
    if (!editable || !selected) return [];
    const p = layout.pos[selected.id];
    if (!p) return [];

    // Занята ли позиция существующим узлом, карточкой жены или слотом.
    const taken: { x: number; y: number }[] = Object.values(layout.pos).map(
      (q) => ({ x: q.x, y: q.y }),
    );
    for (const person of visiblePeople) {
      const pp = layout.pos[person.id];
      if (!pp) continue;
      for (const w of wifeCardsOf(person, pp)) {
        taken.push({ x: w.x, y: w.y });
      }
    }
    const occupied = (x: number, y: number) =>
      taken.some(
        (q) =>
          Math.abs(q.x - x) < NODE_W * 0.8 && Math.abs(q.y - y) < NODE_H * 0.8,
      );

    const slots: { rel: AddRelation; x: number; y: number }[] = [];
    /** Ставит слот на первую свободную позицию из списка кандидатов. */
    const pushFree = (
      rel: AddRelation,
      candidates: { x: number; y: number }[],
    ) => {
      // отрицательные координаты — за холстом, такие кандидаты пропускаем
      const spot = candidates.find(
        (c) => c.x >= 0 && c.y >= 0 && !occupied(c.x, c.y),
      );
      if (!spot) return;
      slots.push({ rel, ...spot });
      taken.push(spot); // чтобы следующие слоты не сели на то же место
    };

    /** Серия кандидатов: j = 0..n-1. */
    const seq = (n: number, fn: (j: number) => { x: number; y: number }) =>
      Array.from({ length: n }, (_, j) => fn(j));
    /** Чередование двух списков: близкие кандидаты идут раньше дальних. */
    const interleave = (
      a: { x: number; y: number }[],
      b: { x: number; y: number }[],
    ) => {
      const out: { x: number; y: number }[] = [];
      for (let j = 0; j < Math.max(a.length, b.length); j++) {
        if (a[j]) out.push(a[j]);
        if (b[j]) out.push(b[j]);
      }
      return out;
    };

    // Отец — над узлом; если занято — в сторону, пока не найдётся место.
    if (!selected.parentId) {
      const above: { x: number; y: number }[] = [
        { x: p.x, y: p.y - ROW_PITCH },
      ];
      for (let j = 1; j <= 6; j++) {
        above.push({ x: p.x + SLOT * j, y: p.y - ROW_PITCH });
        above.push({ x: p.x - SLOT * j, y: p.y - ROW_PITCH });
      }
      pushFree("father", above);
    }
    // Жена — только СПРАВА (после добавления она встаёт справа от мужа,
    // поэтому превью слева только запутает). Сканируем вправо до первой
    // свободной позиции — слот никогда не пропадает.
    // У женского узла (дочь) жену не предлагаем.
    if (!isFemale(selected)) {
      const wives = getSpouses(selected).length;
      pushFree(
        "wife",
        seq(12, (j) => ({ x: p.x + SLOT * (wives + 1 + j), y: p.y })),
      );
    }
    // Сын/дочь — под узлом; дочь СЛЕВА, сын СПРАВА.
    // Если каноничная сторона занята соседней ветвью — ставим слот с другой
    // стороны рядом (близость важнее стороны), слоты никогда не пропадают.
    // У свёрнутой ветви детей не добавляют — сначала нужно раскрыть.
    const isCollapsed = collapsed.has(selected.id);
    const kids = people.filter((k) => k.parentId === selected.id);
    if (isCollapsed && kids.length) {
      return slots;
    }
    if (kids.length) {
      const xs = kids
        .map((k) => layout.pos[k.id]?.x)
        .filter((v): v is number => v !== undefined);
      const rowY = p.y + ROW_PITCH;
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      // Листья семьи лежат вертикальной стопкой — новый ребёнок (тоже лист)
      // продолжит её вниз, поэтому превью ставим в хвост стопки.
      const leafKids = kids.filter(
        (k) =>
          layout.pos[k.id] &&
          !visiblePeople.some((q) => q.parentId === k.id),
      );
      const stackTail: { x: number; y: number }[] = [];
      if (leafKids.length) {
        const sx = layout.pos[leafKids[0].id].x;
        const bottom = Math.max(...leafKids.map((k) => layout.pos[k.id].y));
        stackTail.push(
          { x: sx, y: bottom + STACK_PITCH },
          { x: sx, y: bottom + 2 * STACK_PITCH },
        );
      }
      pushFree("daughter", [
        ...stackTail,
        ...interleave(
          seq(12, (j) => ({ x: minX - SLOT * (j + 1), y: rowY })),
          seq(12, (j) => ({ x: maxX + SLOT * (j + 2), y: rowY })),
        ),
      ]);
      pushFree("son", [
        ...stackTail,
        ...interleave(
          seq(12, (j) => ({ x: maxX + SLOT * (j + 1), y: rowY })),
          seq(12, (j) => ({ x: minX - SLOT * (j + 2), y: rowY })),
        ),
      ]);
    } else {
      const rowY = p.y + ROW_PITCH;
      pushFree(
        "daughter",
        interleave(
          [
            { x: p.x - SLOT / 2 - 6, y: rowY },
            ...seq(11, (j) => ({ x: p.x - SLOT / 2 - 6 - SLOT * (j + 1), y: rowY })),
          ],
          seq(11, (j) => ({ x: p.x + SLOT / 2 + 6 + SLOT * (j + 1), y: rowY })),
        ),
      );
      pushFree(
        "son",
        interleave(
          [
            { x: p.x + SLOT / 2 + 6, y: rowY },
            ...seq(11, (j) => ({ x: p.x + SLOT / 2 + 6 + SLOT * (j + 1), y: rowY })),
          ],
          seq(11, (j) => ({ x: p.x - SLOT / 2 - 6 - SLOT * (j + 1), y: rowY })),
        ),
      );
    }
    return slots;
  }, [editable, selected, people, visiblePeople, layout, collapsed]);

  // вычисляем уголковые связи родитель → дети.
  // Координаты X/Y берём из layout (надёжно), высоту карточки — из DOM.
  const computeConnectors = useCallback(() => {
    setConnectors(
      buildConnectors(
        visiblePeople,
        displayPos,
        (id) => nodeRefs.current[id]?.offsetHeight ?? NODE_H,
      ),
    );
  }, [visiblePeople, displayPos]);

  useEffect(() => {
    computeConnectors();
    const ro = new ResizeObserver(() => computeConnectors());
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", computeConnectors);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", computeConnectors);
    };
  }, [computeConnectors]);

  // зум колесом мыши, когда курсор над областью древа
  const [scale, setScale] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sizerRef = useRef<HTMLDivElement>(null);
  // полноэкранный режим: больше места для просмотра большого древа
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // куда «привязать» точку под курсором после смены масштаба
  const pendingAnchor = useRef<{
    cx: number;
    cy: number;
    clientX: number;
    clientY: number;
  } | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const sizer = sizerRef.current;
      setScale((s) => {
        const next = Math.min(2, Math.max(0.4, s - e.deltaY * 0.0015));
        if (sizer && next !== s) {
          const rect = sizer.getBoundingClientRect();
          // точка под курсором в немасштабированных координатах
          pendingAnchor.current = {
            cx: (e.clientX - rect.left) / s,
            cy: (e.clientY - rect.top) / s,
            clientX: e.clientX,
            clientY: e.clientY,
          };
        }
        return next;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [isFullscreen]);

  // перемещение по древу перетаскиванием левой кнопкой мыши
  const [grabbing, setGrabbing] = useState(false);
  const draggedRef = useRef(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let down = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      // в редакторе карточки перетаскиваются сами — обзор двигаем с фона
      if (movable && (e.target as HTMLElement).closest("[data-drag-card]"))
        return;
      down = true;
      draggedRef.current = false;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = el.scrollLeft;
      startTop = el.scrollTop;
    };
    const onMove = (e: MouseEvent) => {
      if (!down) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!draggedRef.current && Math.hypot(dx, dy) > 4) {
        draggedRef.current = true;
        setGrabbing(true);
      }
      if (draggedRef.current) {
        el.scrollLeft = startLeft - dx;
        el.scrollTop = startTop - dy;
      }
    };
    const onUp = () => {
      down = false;
      setGrabbing(false);
    };
    // если был drag — гасим клик, чтобы не выбрать узел случайно
    const onClick = (e: MouseEvent) => {
      if (draggedRef.current) {
        e.preventDefault();
        e.stopPropagation();
        draggedRef.current = false;
      }
    };

    el.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    el.addEventListener("click", onClick, true);
    return () => {
      el.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      el.removeEventListener("click", onClick, true);
    };
  }, [isFullscreen, movable]);

  // перетаскивание карточки: тянем всю ветвь или одну карточку (Shift — наоборот)
  const startCardDrag = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>, id: string) => {
      if (!onMove || e.button !== 0) return;
      // кнопки внутри карточки (бургер, свернуть) — не начало перетаскивания
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      const branch = (dragMode === "branch") !== e.shiftKey;
      const ids = branch ? collectBranch(id) : [id];
      const idSet = new Set(ids);
      const startX = e.clientX;
      const startY = e.clientY;
      let moved = false;
      const handleMove = (ev: MouseEvent) => {
        if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) > 5) {
          moved = true;
          setMenuId(null);
          setLinePicker(null);
        }
        if (moved) {
          setDrag({
            ids: idSet,
            dx: (ev.clientX - startX) / scale,
            dy: (ev.clientY - startY) / scale,
          });
        }
      };
      const handleUp = (ev: MouseEvent) => {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
        setDrag(null);
        if (moved) {
          draggedRef.current = true; // гасим click после перетаскивания
          onMove(
            ids,
            Math.round((ev.clientX - startX) / scale),
            Math.round((ev.clientY - startY) / scale),
          );
        }
      };
      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [onMove, dragMode, collectBranch, scale],
  );

  // после смены масштаба смещаем скролл так, чтобы точка осталась под курсором
  useLayoutEffect(() => {
    const anchor = pendingAnchor.current;
    const el = scrollRef.current;
    if (!anchor || !el) return;
    pendingAnchor.current = null;
    const elRect = el.getBoundingClientRect();
    const contentW = layout.width * scale;
    const contentH = layout.height * scale;
    const centerX = Math.max(0, (el.clientWidth - contentW) / 2);
    const centerY = Math.max(0, (el.clientHeight - contentH) / 2);
    el.scrollLeft =
      centerX + anchor.cx * scale - (anchor.clientX - elRect.left);
    el.scrollTop = centerY + anchor.cy * scale - (anchor.clientY - elRect.top);
  }, [scale, layout.width, layout.height]);

  // подсветка предков выбранного узла
  const ancestorIds = new Set<string>();
  if (selected) {
    let cur: Person | undefined = selected;
    while (cur?.parentId) {
      ancestorIds.add(cur.parentId);
      cur = people.find((p) => p.id === cur?.parentId);
    }
  }

  // полноэкранный режим: больше места для просмотра большого древа
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  const fs = isFullscreen && mounted;

  /** Плавный зум кнопками (центр области — якорь). */
  const zoomBy = useCallback((delta: number) => {
    const el = scrollRef.current;
    const sizer = sizerRef.current;
    setScale((s) => {
      const next = Math.min(2, Math.max(0.4, s + delta));
      if (el && sizer && next !== s) {
        const rect = sizer.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const clientX = elRect.left + el.clientWidth / 2;
        const clientY = elRect.top + el.clientHeight / 2;
        pendingAnchor.current = {
          cx: (clientX - rect.left) / s,
          cy: (clientY - rect.top) / s,
          clientX,
          clientY,
        };
      }
      return next;
    });
  }, []);

  /** Центрирование: выбранный узел (или корень) — в центр экрана. */
  const centerView = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const targetId = selectedId ?? people[0]?.id;
    const p = targetId ? layout.pos[targetId] : undefined;
    const cx = p ? (p.x + NODE_W / 2) * scale : (layout.width * scale) / 2;
    const cy = p ? (p.y + NODE_H / 2) * scale : (layout.height * scale) / 2;
    const contentW = layout.width * scale;
    const contentH = layout.height * scale;
    const offX = Math.max(0, (el.clientWidth - contentW) / 2);
    const offY = Math.max(0, (el.clientHeight - contentH) / 2);
    el.scrollTo({
      left: offX + cx - el.clientWidth / 2,
      top: offY + cy - el.clientHeight / 2,
      behavior: "smooth",
    });
  }, [selectedId, people, layout, scale]);

  /** Экспорт древа в PNG: рисуем на canvas без внешних библиотек.
   *  Всегда экспортируется ПОЛНОЕ древо — свёрнутые ветви не влияют. */
  const exportPng = useCallback(() => {
    // отдельная раскладка полного древа без запаса под плейсхолдеры «+»
    const full = computeTreeLayout(people, false);
    const PAD = 40;
    const dpr = 2; // чёткость
    const canvas = document.createElement("canvas");
    canvas.width = (full.width + PAD * 2) * dpr;
    canvas.height = (full.height + PAD * 2) * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Фон в цветах сайта
    ctx.fillStyle = "#14100c";
    ctx.fillRect(0, 0, full.width + PAD * 2, full.height + PAD * 2);
    ctx.translate(PAD, PAD);

    // Связи родитель → дети (общая логика с интерактивным SVG)
    const bColors = computeBranchColors(people);
    const strokeFor = (id?: string) => {
      const bc = id ? bColors.get(id) : undefined;
      return bc ? `${bc}b3` : "rgba(201,162,39,0.5)";
    };
    ctx.lineWidth = 2;
    for (const c of buildConnectors(people, full.pos, () => NODE_H)) {
      // спуск от родителя + шина — цвет ветви родителя
      ctx.strokeStyle = strokeFor(c.pid);
      ctx.beginPath();
      ctx.moveTo(c.px, c.py);
      ctx.lineTo(c.px, c.busY);
      ctx.moveTo(c.minX, c.busY);
      ctx.lineTo(c.maxX, c.busY);
      ctx.stroke();
      // спуски к детям — цвет ветви самого ребёнка
      for (const k of c.children) {
        ctx.strokeStyle = strokeFor(k.id);
        ctx.beginPath();
        ctx.moveTo(k.x, c.busY);
        ctx.lineTo(k.x, k.topY);
        ctx.stroke();
      }
      // хребет стопки (цвет родителя) и отводы (цвет ребёнка)
      for (const s of c.extra) {
        ctx.strokeStyle = strokeFor(s.cid ?? c.pid);
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
        ctx.stroke();
      }
    }

    // Линии брака: муж — жена (рисуем до карточек, чтобы линия шла под ними)
    ctx.strokeStyle = "#9c6b74";
    ctx.lineWidth = 2;
    for (const person of people) {
      const p = full.pos[person.id];
      if (!p) continue;
      const wives = getSpouses(person);
      if (!wives.length) continue;
      ctx.beginPath();
      ctx.moveTo(p.x + NODE_W - 8, p.y + NODE_H / 2);
      ctx.lineTo(p.x + SLOT * wives.length + 8, p.y + NODE_H / 2);
      ctx.stroke();
    }

    // перенос текста по словам под ширину карточки (максимум maxLines строк)
    const wrapText = (text: string, maxW: number, maxLines: number) => {
      let lines: string[] = [];
      let line = "";
      for (const word of text.split(" ")) {
        const probe = line ? `${line} ${word}` : word;
        if (ctx.measureText(probe).width > maxW && line) {
          lines.push(line);
          line = word;
        } else {
          line = probe;
        }
      }
      if (line) lines.push(line);
      if (lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
        lines[maxLines - 1] = `${lines[maxLines - 1]}…`;
      }
      return lines;
    };

    // Узлы: компактная карточка — полное имя (с переносами) и годы
    for (const person of people) {
      const p = full.pos[person.id];
      if (!p) continue;

      ctx.font = "600 13px Georgia, serif";
      const maxTextW = NODE_W - 32;
      const nameLines = wrapText(person.name, maxTextW, 2);

      const years = person.birth
        ? `${person.birth}${person.death ? `–${person.death}` : ""}`
        : "";
      // карточки фиксированного размера
      const cardH = NODE_H;

      const r = 14;
      ctx.beginPath();
      ctx.roundRect(p.x, p.y, NODE_W, cardH, r);
      ctx.fillStyle = "#201a12";
      ctx.fill();
      ctx.strokeStyle = "#c9a227";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // цветная метка ветви на левом крае карточки
      const bc = bColors.get(person.id);
      if (bc) {
        ctx.beginPath();
        ctx.roundRect(p.x + 1, p.y + 12, 4, cardH - 24, [0, 2, 2, 0]);
        ctx.fillStyle = bc;
        ctx.fill();
      }

      const tx = p.x + 16;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#f2ecdd";
      ctx.font = "600 13px Georgia, serif";
      nameLines.forEach((l, i) => ctx.fillText(l, tx, p.y + 14 + i * 16));

      const cursorY = p.y + 14 + nameLines.length * 16 + 4;
      if (years) {
        ctx.fillStyle = "#a99a78";
        ctx.font = "11px Arial, sans-serif";
        ctx.fillText(years, tx, cursorY);
      }

      // карточки жён — сателлиты справа от карточки мужа
      const spouses = getSpouses(person);
      const female = isFemale(person);
      spouses.forEach((wifeName, i) => {
        const wx = p.x + SLOT * (i + 1);
        ctx.beginPath();
        ctx.roundRect(wx, p.y, NODE_W, cardH, r);
        ctx.fillStyle = "#221619";
        ctx.fill();
        ctx.strokeStyle = "#8a5560";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const wtx = wx + 16;
        ctx.fillStyle = "#d8a7b1";
        ctx.font = "600 9px Arial, sans-serif";
        const label = female
          ? "МУЖ"
          : spouses.length > 1
            ? `${i + 1}-Я ЖЕНА`
            : "ЖЕНА";
        ctx.fillText(`⚭ ${label}`, wtx, p.y + 14);

        ctx.fillStyle = "#f2ecdd";
        ctx.font = "600 13px Georgia, serif";
        wrapText(wifeName, maxTextW, 3).forEach((l, j) =>
          ctx.fillText(l, wtx, p.y + 30 + j * 16),
        );
      });
    }

    const a = document.createElement("a");
    a.download = "vorhda-drevo.png";
    a.href = canvas.toDataURL("image/png");
    a.click();
  }, [people]);

  const tree = (
    <div
      className={cn(
        fs
          ? "fixed inset-0 z-[55] flex flex-col bg-background p-4"
          : "relative",
      )}
    >
      {/* Счётчик людей — как на Familio, сверху по центру */}
      <div className="pointer-events-none absolute inset-x-0 top-2 z-20 flex justify-center">
        <span className="rounded-full border border-border bg-card/80 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
          Людей в древе:{" "}
          <span className="text-foreground">{people.length}</span>
        </span>
      </div>

      {/* Переключатель перетаскивания: что двигать за карточку (Shift — наоборот) */}
      {movable ? (
        <div
          className="absolute left-2 top-2 z-20 flex items-center gap-1 rounded-full border border-border bg-card/80 p-1 text-xs backdrop-blur"
          title="Что двигается при перетаскивании карточки (Shift — наоборот)"
        >
          <Move className="ml-1.5 h-3.5 w-3.5 text-muted-foreground" />
          <span className="pr-0.5 text-muted-foreground">Тянуть:</span>
          <button
            type="button"
            onClick={() => setDragMode("branch")}
            className={cn(
              "rounded-full px-2.5 py-1 transition-colors",
              dragMode === "branch"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Ветвь
          </button>
          <button
            type="button"
            onClick={() => setDragMode("single")}
            className={cn(
              "rounded-full px-2.5 py-1 transition-colors",
              dragMode === "single"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Карточку
          </button>
        </div>
      ) : null}

      {/* Панель управления — колонка справа (как на Familio) */}
      <div className="absolute right-2 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-1.5">
        <button
          type="button"
          onClick={() => zoomBy(0.15)}
          aria-label="Приблизить"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card/80 text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => zoomBy(-0.15)}
          aria-label="Отдалить"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card/80 text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setScale(1)}
          aria-label="Сбросить масштаб"
          className="rounded-full border border-border bg-card/80 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          type="button"
          onClick={centerView}
          aria-label="Центрировать"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card/80 text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
        >
          <Crosshair className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setIsFullscreen((v) => !v)}
          aria-label={isFullscreen ? "Свернуть" : "На весь экран"}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card/80 text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
        >
          {isFullscreen ? (
            <Minimize2 className="h-4 w-4" />
          ) : (
            <Maximize2 className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          onClick={exportPng}
          aria-label="Сохранить как изображение"
          title="Сохранить как изображение"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card/80 text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
        >
          <Download className="h-4 w-4" />
        </button>
      </div>
      <div
        ref={scrollRef}
        className={cn(
          "overflow-auto pb-4",
          fs && "flex-1",
          grabbing ? "cursor-grabbing" : "cursor-grab",
        )}
        style={{ maxHeight: fs ? "100%" : "75vh" }}
      >
        <div
          ref={sizerRef}
          className="relative mx-auto"
          style={{ width: layout.width * scale, height: layout.height * scale }}
        >
          <div
            ref={containerRef}
            className="absolute left-0 top-0"
            style={{
              width: layout.width,
              height: layout.height,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            {/* SVG связи */}
            <svg
              className="pointer-events-none absolute inset-0 z-0"
              width={layout.width}
              height={layout.height}
              aria-hidden="true"
            >
              {connectors.map((c, i) => {
                const bc = branchColors.get(c.pid);
                const parentStroke = bc ?? "rgb(var(--primary) / 0.45)";
                return (
                  <g
                    key={i}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeOpacity={0.7}
                  >
                    {/* спуск от родителя к шине + шина — цвет ветви родителя */}
                    <line
                      x1={c.px}
                      y1={c.py}
                      x2={c.px}
                      y2={c.busY}
                      stroke={parentStroke}
                    />
                    <line
                      x1={c.minX}
                      y1={c.busY}
                      x2={c.maxX}
                      y2={c.busY}
                      stroke={parentStroke}
                    />
                    {/* спуски к детям — цвет ветви самого ребёнка */}
                    {c.children.map((ch, j) => (
                      <line
                        key={j}
                        x1={ch.x}
                        y1={c.busY}
                        x2={ch.x}
                        y2={ch.topY}
                        stroke={
                          branchColors.get(ch.id) ??
                          "rgb(var(--primary) / 0.45)"
                        }
                      />
                    ))}
                    {/* хребет стопки листьев (цвет родителя) + отводы (цвет ребёнка) */}
                    {c.extra.map((s, j) => (
                      <line
                        key={`e${j}`}
                        x1={s.x1}
                        y1={s.y1}
                        x2={s.x2}
                        y2={s.y2}
                        stroke={
                          (s.cid
                            ? branchColors.get(s.cid)
                            : branchColors.get(c.pid)) ??
                          "rgb(var(--primary) / 0.45)"
                        }
                      />
                    ))}
                  </g>
                );
              })}

              {/* невидимые широкие зоны клика по линиям: открывают палитру
                  «цвет ветви» — клик по линии красит ветвь, в которую она ведёт */}
              {onSetColor
                ? connectors.map((c, i) => {
                    const openPicker = (
                      e: ReactMouseEvent<SVGLineElement>,
                      id: string,
                    ) => {
                      e.stopPropagation();
                      const svg = e.currentTarget.ownerSVGElement;
                      const rect = svg?.getBoundingClientRect();
                      if (!rect) return;
                      setMenuId(null);
                      setLinePicker({
                        id,
                        x: (e.clientX - rect.left) / scale,
                        y: (e.clientY - rect.top) / scale,
                      });
                    };
                    const hit = {
                      stroke: "transparent",
                      strokeWidth: 14,
                      style: {
                        pointerEvents: "stroke",
                        cursor: "pointer",
                      } as CSSProperties,
                    };
                    return (
                      <g key={`hit-${i}`}>
                        <line
                          x1={c.px}
                          y1={c.py}
                          x2={c.px}
                          y2={c.busY}
                          {...hit}
                          onClick={(e) => openPicker(e, c.pid)}
                        />
                        <line
                          x1={c.minX}
                          y1={c.busY}
                          x2={c.maxX}
                          y2={c.busY}
                          {...hit}
                          onClick={(e) => openPicker(e, c.pid)}
                        />
                        {c.children.map((ch, j) => (
                          <line
                            key={j}
                            x1={ch.x}
                            y1={c.busY}
                            x2={ch.x}
                            y2={ch.topY}
                            {...hit}
                            onClick={(e) => openPicker(e, ch.id)}
                          />
                        ))}
                        {c.extra.map((s, j) => (
                          <line
                            key={`e${j}`}
                            x1={s.x1}
                            y1={s.y1}
                            x2={s.x2}
                            y2={s.y2}
                            {...hit}
                            onClick={(e) => openPicker(e, s.cid ?? c.pid)}
                          />
                        ))}
                      </g>
                    );
                  })
                : null}

              {/* линии брака: муж — жена (жёны справа от мужа) */}
              {visiblePeople.map((person) => {
                const pp = displayPos[person.id];
                if (!pp) return null;
                const wives = getSpouses(person);
                if (!wives.length) return null;
                const midY = pp.y + NODE_H / 2;
                return (
                  <line
                    key={`marriage-${person.id}`}
                    x1={pp.x + NODE_W - 8}
                    y1={midY}
                    x2={pp.x + SLOT * wives.length + 8}
                    y2={midY}
                    stroke="#9c6b74"
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                );
              })}

              {/* пунктирные связи к плейсхолдерам «+» */}
              {selected && !drag && layout.pos[selected.id]
                ? addSlots.map((slot) => {
                    const sp = layout.pos[selected.id];
                    const x1 = sp.x + NODE_W / 2;
                    const y1 = sp.y + NODE_H / 2;
                    const x2 = slot.x + NODE_W / 2;
                    const y2 = slot.y + NODE_H / 2;
                    return (
                      <line
                        key={slot.rel}
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke="rgb(var(--primary) / 0.25)"
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                      />
                    );
                  })
                : null}
            </svg>

            {/* узлы древа — прямоугольные карточки (абсолютная раскладка) */}
            <div className="relative z-10">
              {visiblePeople.map((person) => {
                const isSelected = person.id === selectedId;
                const isAncestor = ancestorIds.has(person.id);
                const isLiving = !person.death;
                const isCollapsed = collapsed.has(person.id);
                const kidsCount = descendantCount.get(person.id) ?? 0;
                const branchColor = branchColors.get(person.id);
                const p = displayPos[person.id];
                if (!p) return null;
                return (
                  <div
                    key={person.id}
                    ref={(el) => {
                      nodeRefs.current[person.id] = el;
                    }}
                    role="button"
                    tabIndex={0}
                    data-drag-card={movable ? "true" : undefined}
                    onMouseDown={
                      movable ? (e) => startCardDrag(e, person.id) : undefined
                    }
                    onClick={() => onSelect(person.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(person.id);
                      }
                    }}
                    style={{
                      position: "absolute",
                      left: p.x,
                      top: p.y,
                      width: NODE_W,
                      height: NODE_H,
                      // Карточка с открытым меню поднимается над плейсхолдерами
                      // «+ родственник»: hover-transform создаёт stacking context,
                      // и без этого меню рисуется ПОД плейсхолдером.
                      zIndex:
                        menuId === person.id
                          ? 40
                          : drag?.ids.has(person.id)
                            ? 30
                            : undefined,
                    }}
                    className={cn(
                      "group cursor-pointer overflow-visible rounded-2xl border bg-card p-4 text-left transition-all duration-200 hover:-translate-y-0.5",
                      isSelected
                        ? "border-primary shadow-[0_0_0_1px_var(--primary)]"
                        : isAncestor
                          ? "border-primary/50"
                          : "border-border hover:border-primary/40",
                    )}
                  >
                    {/* Цветная метка ветви, назначенная пользователем */}
                    {branchColor ? (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute bottom-3 left-0 top-3 w-1 rounded-r-full"
                        style={{ backgroundColor: branchColor }}
                      />
                    ) : null}
                    {/* Бургер-меню карточки; само меню раскрывается СПРАВА от карточки */}
                    {onShowInfo ? (
                      <>
                        <button
                          type="button"
                          aria-label="Меню карточки"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLinePicker(null);
                            setMenuId((v) =>
                              v === person.id ? null : person.id,
                            );
                          }}
                          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                        {menuId === person.id ? (
                          <div className="absolute left-full top-0 z-30 ml-2 min-w-36 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuId(null);
                                onShowInfo(person.id);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-secondary"
                            >
                              <Info className="h-4 w-4 text-primary" />
                              Информация
                            </button>
                            {onEdit ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMenuId(null);
                                  onEdit(person.id);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-secondary"
                              >
                                <Pencil className="h-4 w-4 text-primary" />
                                Редактировать
                              </button>
                            ) : null}
                            {onResetPos &&
                            collectBranch(person.id).some((bid) => {
                              const bp = people.find((x) => x.id === bid);
                              return Boolean(bp?.offsetX || bp?.offsetY);
                            }) ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMenuId(null);
                                  onResetPos(collectBranch(person.id));
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-secondary"
                              >
                                <Undo2 className="h-4 w-4 text-primary" />
                                Вернуть на место
                              </button>
                            ) : null}
                            {onDelete ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMenuId(null);
                                  onDelete(person.id);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-[#f0a0a0] transition-colors hover:bg-[#2a1714]"
                              >
                                <Trash2 className="h-4 w-4" />
                                Удалить
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    ) : null}

                    <p
                      className={cn(
                        "line-clamp-2 break-words font-serif text-base font-semibold leading-snug text-foreground",
                        onShowInfo && "pr-6",
                      )}
                    >
                      {person.name}
                    </p>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {person.birth}
                        {person.death ? `–${person.death}` : ""}
                      </span>
                      {isLiving ? (
                        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                          жив
                        </span>
                      ) : null}
                    </div>
                    {/* Кнопка сворачивания ветви — на нижней кромке карточки.
                        Показывается только у узлов с потомками. */}
                    {kidsCount > 0 ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCollapse(person.id);
                        }}
                        aria-label={
                          isCollapsed
                            ? `Развернуть ветвь (${kidsCount})`
                            : "Свернуть ветвь"
                        }
                        title={
                          isCollapsed
                            ? `Развернуть ветвь — скрыто: ${kidsCount}`
                            : "Свернуть ветвь"
                        }
                        className={cn(
                          "absolute -bottom-3.5 left-1/2 z-20 flex h-7 min-w-7 -translate-x-1/2 items-center justify-center rounded-full border px-1 text-[11px] font-medium backdrop-blur transition-colors",
                          isCollapsed
                            ? "border-primary/60 bg-secondary text-primary hover:bg-primary hover:text-primary-foreground"
                            : "border-border bg-card text-muted-foreground hover:border-primary/60 hover:text-primary",
                        )}
                      >
                        {isCollapsed ? (
                          kidsCount
                        ) : (
                          <ChevronUp className="h-4 w-4" />
                        )}
                      </button>
                    ) : null}
                  </div>
                );
              })}

              {/* карточки жён — сателлиты справа от карточки мужа */}
              {visiblePeople.flatMap((person) => {
                const pp = displayPos[person.id];
                if (!pp) return [];
                const female = isFemale(person);
                const wives = wifeCardsOf(person, pp);
                return wives.map((w, i) => {
                  // составной ключ, чтобы бургер жены жил в том же state, что и у карточек
                  const wifeKey = `${person.id}::wife::${i}`;
                  return (
                    <div
                      key={`${person.id}-wife-${i}`}
                      style={{
                        position: "absolute",
                        left: w.x,
                        top: w.y,
                        width: NODE_W,
                        height: NODE_H,
                        zIndex: menuId === wifeKey ? 40 : undefined,
                      }}
                      className="rounded-2xl border border-[#8a5560]/60 bg-[#221619] p-4 text-left"
                      title={w.name}
                    >
                      {/* Бургер-меню карточки жены — та же механика, что у карточек людей */}
                      {onWifeInfo ? (
                        <>
                          <button
                            type="button"
                            aria-label="Меню карточки жены"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuId((v) => (v === wifeKey ? null : wifeKey));
                            }}
                            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                          {menuId === wifeKey ? (
                            <div className="absolute left-full top-0 z-30 ml-2 min-w-36 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMenuId(null);
                                  onWifeInfo(person.id, i);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-secondary"
                              >
                                <Info className="h-4 w-4 text-primary" />
                                Информация
                              </button>
                              {onWifeEdit ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMenuId(null);
                                    onWifeEdit(person.id, i);
                                  }}
                                  className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-secondary"
                                >
                                  <Pencil className="h-4 w-4 text-primary" />
                                  Редактировать
                                </button>
                              ) : null}
                              {onWifeDelete ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMenuId(null);
                                    onWifeDelete(person.id, i);
                                  }}
                                  className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-[#f0a0a0] transition-colors hover:bg-[#2a1714]"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Удалить
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </>
                      ) : null}

                      <p
                        className={cn(
                          "text-[10px] font-medium uppercase tracking-wider text-[#d8a7b1]",
                          onWifeInfo && "pr-6",
                        )}
                      >
                        ⚭{" "}
                        {female
                          ? "муж"
                          : wives.length > 1
                            ? `${i + 1}-я жена`
                            : "жена"}
                      </p>
                      <p className="mt-1 line-clamp-3 break-words font-serif text-base font-semibold leading-snug text-foreground">
                        {w.name}
                      </p>
                    </div>
                  );
                });
              })}

              {/* плейсхолдеры «добавить родственника» вокруг выбранного */}
              {drag
                ? null
                : addSlots.map((slot) => (
                <button
                  key={slot.rel}
                  type="button"
                  onClick={() => onAddRelative?.(slot.rel)}
                  style={{
                    position: "absolute",
                    left: slot.x,
                    top: slot.y,
                    width: NODE_W,
                    height: NODE_H,
                  }}
                  className="group flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border bg-card/50 transition-all duration-200 hover:border-primary/60"
                  aria-label={`Добавить: ${ADD_LABEL[slot.rel]}`}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-xl font-light text-muted-foreground transition-colors group-hover:text-primary">
                    +
                  </span>
                  <span className="text-xs text-muted-foreground transition-colors group-hover:text-primary">
                    {ADD_LABEL[slot.rel]}
                  </span>
                </button>
                ))}

              {/* всплывающая палитра «цвет ветви» — открывается кликом по линии */}
              {onSetColor && linePicker ? (
                <div
                  style={{
                    position: "absolute",
                    left: linePicker.x,
                    top: linePicker.y,
                    zIndex: 50,
                  }}
                  className="w-40 -translate-x-1/2 translate-y-2 rounded-xl border border-border bg-card p-3 shadow-lg"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="mb-2 truncate text-xs text-muted-foreground">
                    Ветвь:{" "}
                    <span className="text-foreground">
                      {people.find((p) => p.id === linePicker.id)?.name ?? ""}
                    </span>
                  </p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {BRANCH_PALETTE.map((color) => (
                      <button
                        key={color}
                        type="button"
                        aria-label={`Цвет ${color}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSetColor(linePicker.id, color);
                          setLinePicker(null);
                        }}
                        className={cn(
                          "h-7 w-7 rounded-full border transition-transform hover:scale-110",
                          people.find((p) => p.id === linePicker.id)
                            ?.branchColor === color
                            ? "border-foreground"
                            : "border-transparent",
                        )}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSetColor(linePicker.id, null);
                      setLinePicker(null);
                    }}
                    className="mt-2 w-full rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    Без цвета
                  </button>
                  {/* свой цвет: полная свобода — системная палитра любого оттенка */}
                  <label
                    className="mt-1 flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span
                      className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full border border-border"
                      style={{
                        background:
                          "conic-gradient(#f55, #fd5, #7d5, #5dc, #57d, #a5d, #f55)",
                      }}
                    >
                      <input
                        type="color"
                        aria-label="Свой цвет"
                        value={
                          people.find((p) => p.id === linePicker.id)
                            ?.branchColor ?? "#c9a227"
                        }
                        onChange={(e) =>
                          onSetColor(linePicker.id, e.target.value)
                        }
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      />
                    </span>
                    Свой цвет
                  </label>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return fs ? createPortal(tree, document.body) : tree;
}
