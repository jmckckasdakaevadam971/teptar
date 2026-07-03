"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  Pencil,
  Plus,
  Trash2,
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
  px: number; // центр родителя по X
  py: number; // низ родителя по Y
  busY: number; // высота горизонтальной шины
  minX: number;
  maxX: number;
  children: { x: number; topY: number }[];
};

/** Чистая древовидная раскладка: каждый родитель центрируется над детьми.
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
  const maxGen = Math.max(...people.map((p) => p.generation));
  let cursor = 0;

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
      const xs = [...kids].reverse().map(place);
      x = (Math.min(...xs) + Math.max(...xs)) / 2;
      // карточки жён торчат вправо — сдвигаем курсор, чтобы следующая
      // ветвь не наехала на них
      cursor = Math.max(cursor, x / SLOT + unitSlots);
    }
    pos[node.id] = { x, y: (node.generation - minGen) * ROW_PITCH };
    return x;
  };
  [...roots].reverse().forEach(place);

  let width = cursor > 0 ? (cursor - 1) * SLOT + NODE_W : NODE_W;
  let height = (maxGen - minGen) * ROW_PITCH + NODE_H;

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

export function TreeView({
  people,
  selectedId,
  onSelect,
  onAddRelative,
  onShowInfo,
  onEdit,
  onDelete,
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
  /** Если передан — на карточках жён появляется бургер-меню с пунктом «Информация».
   *  wifeIndex — позиция жены в списке getSpouses(person). */
  onWifeInfo?: (personId: string, wifeIndex: number) => void;
  /** Пункт «Редактировать» в бургер-меню карточки жены. */
  onWifeEdit?: (personId: string, wifeIndex: number) => void;
  /** Пункт «Удалить» в бургер-меню карточки жены. */
  onWifeDelete?: (personId: string, wifeIndex: number) => void;
}) {
  const editable = Boolean(onAddRelative);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  // какая карточка держит открытым бургер-меню
  const [menuId, setMenuId] = useState<string | null>(null);
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

  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // клик в любом месте вне меню — закрыть его
  useEffect(() => {
    if (!menuId) return;
    const close = () => setMenuId(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuId]);

  // раскладка видимой части древа (свёрнутые ветви исключены)
  const layout = useMemo(
    () => computeTreeLayout(visiblePeople, editable),
    [visiblePeople, editable],
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
      const spot = candidates.find((c) => !occupied(c.x, c.y));
      if (!spot) return;
      slots.push({ rel, ...spot });
      taken.push(spot); // чтобы следующие слоты не сели на то же место
    };

    // Отец — над узлом (если занято — чуть в сторону).
    if (!selected.parentId) {
      pushFree("father", [
        { x: p.x, y: p.y - ROW_PITCH },
        { x: p.x + SLOT, y: p.y - ROW_PITCH },
        { x: p.x - SLOT, y: p.y - ROW_PITCH },
      ]);
    }
    // Жена — сразу за последней женой справа; если занято — слева и дальше.
    // У женского узла (дочь) жену не предлагаем.
    // Жён может быть несколько, поэтому слот доступен всегда.
    if (!isFemale(selected)) {
      const wives = getSpouses(selected).length;
      pushFree("wife", [
        { x: p.x + SLOT * (wives + 1), y: p.y },
        { x: p.x - SLOT, y: p.y },
        { x: p.x + SLOT * (wives + 2), y: p.y },
        { x: p.x - 2 * SLOT, y: p.y },
      ]);
    }
    // Сын/дочь — под узлом; дочь СЛЕВА, сын СПРАВА.
    // Если дети уже есть — сбоку от крайних детей.
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
      pushFree("daughter", [
        { x: Math.min(...xs) - SLOT, y: rowY },
        { x: Math.min(...xs) - 2 * SLOT, y: rowY },
      ]);
      pushFree("son", [
        { x: Math.max(...xs) + SLOT, y: rowY },
        { x: Math.max(...xs) + 2 * SLOT, y: rowY },
      ]);
    } else {
      const rowY = p.y + ROW_PITCH;
      pushFree("daughter", [
        { x: p.x - SLOT / 2 - 6, y: rowY },
        { x: p.x - SLOT, y: rowY },
        { x: p.x - 2 * SLOT, y: rowY },
      ]);
      pushFree("son", [
        { x: p.x + SLOT / 2 + 6, y: rowY },
        { x: p.x + SLOT, y: rowY },
        { x: p.x + 2 * SLOT, y: rowY },
      ]);
    }
    return slots;
  }, [editable, selected, people, visiblePeople, layout, collapsed]);

  // вычисляем уголковые связи родитель → дети.
  // Координаты X/Y берём из layout (надёжно), высоту карточки — из DOM.
  const computeConnectors = useCallback(() => {
    // группируем детей по родителю (только видимые узлы)
    const byParent = new Map<string, Person[]>();
    for (const person of visiblePeople) {
      if (!person.parentId) continue;
      const arr = byParent.get(person.parentId) ?? [];
      arr.push(person);
      byParent.set(person.parentId, arr);
    }

    const next: Connector[] = [];
    byParent.forEach((kids, parentId) => {
      const pPos = layout.pos[parentId];
      const parentEl = nodeRefs.current[parentId];
      if (!pPos || !parentEl) return;
      const px = pPos.x + NODE_W / 2;
      const py = pPos.y + parentEl.offsetHeight;

      const children: { x: number; topY: number }[] = [];
      for (const kid of kids) {
        const cPos = layout.pos[kid.id];
        if (!cPos) continue;
        children.push({ x: cPos.x + NODE_W / 2, topY: cPos.y });
      }
      if (!children.length) return;

      const childTopMin = Math.min(...children.map((c) => c.topY));
      const busY = py + (childTopMin - py) / 2;
      const xs = [px, ...children.map((c) => c.x)];
      next.push({
        px,
        py,
        busY,
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        children,
      });
    });
    setConnectors(next);
  }, [visiblePeople, layout]);

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
  }, [isFullscreen]);

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

    // Связи родитель → дети (та же логика, что в computeConnectors)
    ctx.strokeStyle = "rgba(201,162,39,0.5)";
    ctx.lineWidth = 2;
    const byParent = new Map<string, Person[]>();
    for (const person of people) {
      if (!person.parentId) continue;
      const arr = byParent.get(person.parentId) ?? [];
      arr.push(person);
      byParent.set(person.parentId, arr);
    }
    byParent.forEach((kids, parentId) => {
      const pPos = full.pos[parentId];
      if (!pPos) return;
      const px = pPos.x + NODE_W / 2;
      const py = pPos.y + NODE_H;
      const kidPts = kids
        .map((k) => full.pos[k.id])
        .filter(Boolean)
        .map((q) => ({ x: q.x + NODE_W / 2, topY: q.y }));
      if (!kidPts.length) return;
      const busY = py + (Math.min(...kidPts.map((k) => k.topY)) - py) / 2;
      const xs = [px, ...kidPts.map((k) => k.x)];
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px, busY);
      ctx.moveTo(Math.min(...xs), busY);
      ctx.lineTo(Math.max(...xs), busY);
      for (const k of kidPts) {
        ctx.moveTo(k.x, busY);
        ctx.lineTo(k.x, k.topY);
      }
      ctx.stroke();
    });

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
              {connectors.map((c, i) => (
                <g
                  key={i}
                  stroke="rgb(var(--primary) / 0.45)"
                  strokeWidth={2}
                  strokeLinecap="round"
                >
                  {/* спуск от родителя к шине */}
                  <line x1={c.px} y1={c.py} x2={c.px} y2={c.busY} />
                  {/* горизонтальная шина */}
                  <line x1={c.minX} y1={c.busY} x2={c.maxX} y2={c.busY} />
                  {/* спуски к каждому ребёнку */}
                  {c.children.map((ch, j) => (
                    <line
                      key={j}
                      x1={ch.x}
                      y1={c.busY}
                      x2={ch.x}
                      y2={ch.topY}
                    />
                  ))}
                </g>
              ))}

              {/* линии брака: муж — жена (жёны справа от мужа) */}
              {visiblePeople.map((person) => {
                const pp = layout.pos[person.id];
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
              {selected && layout.pos[selected.id]
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
                const p = layout.pos[person.id];
                if (!p) return null;
                return (
                  <div
                    key={person.id}
                    ref={(el) => {
                      nodeRefs.current[person.id] = el;
                    }}
                    role="button"
                    tabIndex={0}
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
                      zIndex: menuId === person.id ? 40 : undefined,
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
                    {/* Бургер-меню карточки; само меню раскрывается СПРАВА от карточки */}
                    {onShowInfo ? (
                      <>
                        <button
                          type="button"
                          aria-label="Меню карточки"
                          onClick={(e) => {
                            e.stopPropagation();
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
                const pp = layout.pos[person.id];
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
              {addSlots.map((slot) => (
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return fs ? createPortal(tree, document.body) : tree;
}
