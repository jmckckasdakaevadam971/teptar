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
  Crosshair,
  Download,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
} from "lucide-react";
import type { Person } from "@/lib/demo-data";
import { cn } from "@/lib/utils";

// размеры узла и отступы для древовидной раскладки (круглые аватарки а-ля Familio)
const CIRCLE = 72; // диаметр круга
const NODE_W = 128; // ширина слота (круг + подпись)
const NODE_H = 128; // круг + имя + годы
const H_GAP = 20;
const V_GAP = 56;
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

/** Цвет бейджа роли на аватарке (как на Familio: Отец — зелёный, Мать/Дочь — розовый…). */
function roleBadgeClass(role: string): string {
  const r = role.toLowerCase();
  if (r.includes("отец") || r.includes("предок") || r.includes("дед"))
    return "bg-emerald-600/90 text-white";
  if (
    r.includes("мать") ||
    r.includes("доч") ||
    r.includes("жен") ||
    r.includes("бабуш")
  )
    return "bg-rose-500/90 text-white";
  if (r.includes("сын") || r.includes("брат"))
    return "bg-sky-600/90 text-white";
  return "bg-primary/90 text-primary-foreground";
}

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

export function TreeView({
  people,
  selectedId,
  onSelect,
  onAddRelative,
}: {
  people: Person[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Если передан — вокруг выбранного узла появляются «+» для добавления родных. */
  onAddRelative?: (rel: AddRelation) => void;
}) {
  const editable = Boolean(onAddRelative);
  const [connectors, setConnectors] = useState<Connector[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // древовидная раскладка: каждый родитель центрируется над своими детьми
  const layout = useMemo(() => {
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
      let x: number;
      if (!kids || kids.length === 0) {
        x = cursor * SLOT;
        cursor += 1;
      } else {
        const xs = [...kids].reverse().map(place);
        x = (Math.min(...xs) + Math.max(...xs)) / 2;
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
  }, [people, editable]);

  const selected = people.find((p) => p.id === selectedId) ?? null;

  // Слоты «добавить родственника» вокруг выбранного узла (Familio-стиль).
  const addSlots = useMemo(() => {
    if (!editable || !selected) return [];
    const p = layout.pos[selected.id];
    if (!p) return [];
    const slots: { rel: AddRelation; x: number; y: number }[] = [];

    // Отец — над узлом, если родитель ещё не указан.
    if (!selected.parentId) {
      slots.push({ rel: "father", x: p.x, y: p.y - ROW_PITCH });
    }
    // Жена — справа, если супруга не записана.
    if (!selected.spouseName) {
      slots.push({ rel: "wife", x: p.x + SLOT, y: p.y });
    }
    // Сын/дочь — под узлом; если дети уже есть — сбоку от крайних детей.
    const kids = people.filter((k) => k.parentId === selected.id);
    if (kids.length) {
      const xs = kids
        .map((k) => layout.pos[k.id]?.x)
        .filter((v): v is number => v !== undefined);
      const rowY = p.y + ROW_PITCH;
      slots.push({ rel: "son", x: Math.min(...xs) - SLOT, y: rowY });
      slots.push({ rel: "daughter", x: Math.max(...xs) + SLOT, y: rowY });
    } else {
      slots.push({ rel: "son", x: p.x - SLOT / 2 - 6, y: p.y + ROW_PITCH });
      slots.push({
        rel: "daughter",
        x: p.x + SLOT / 2 + 6,
        y: p.y + ROW_PITCH,
      });
    }
    // Не рисуем плейсхолдер поверх существующего узла.
    const occupied = (x: number, y: number) =>
      Object.values(layout.pos).some(
        (q) =>
          Math.abs(q.x - x) < NODE_W * 0.8 && Math.abs(q.y - y) < NODE_H * 0.8,
      );
    return slots.filter((s) => !occupied(s.x, s.y));
  }, [editable, selected, people, layout]);

  // вычисляем уголковые связи родитель → дети.
  // Координаты X/Y берём из layout (надёжно), высоту карточки — из DOM.
  const computeConnectors = useCallback(() => {
    // группируем детей по родителю
    const byParent = new Map<string, Person[]>();
    for (const person of people) {
      if (!person.parentId) continue;
      const arr = byParent.get(person.parentId) ?? [];
      arr.push(person);
      byParent.set(person.parentId, arr);
    }

    const next: Connector[] = [];
    byParent.forEach((kids, parentId) => {
      const pPos = layout.pos[parentId];
      if (!pPos) return;
      const px = pPos.x + NODE_W / 2;
      const py = pPos.y + CIRCLE; // линии идут от низа круга, не карточки

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
  }, [people, layout]);

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
    const cy = p ? (p.y + CIRCLE / 2) * scale : (layout.height * scale) / 2;
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

  /** Экспорт древа в PNG: рисуем на canvas без внешних библиотек. */
  const exportPng = useCallback(() => {
    const PAD = 40;
    const dpr = 2; // чёткость
    const canvas = document.createElement("canvas");
    canvas.width = (layout.width + PAD * 2) * dpr;
    canvas.height = (layout.height + PAD * 2) * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Фон в цветах сайта
    ctx.fillStyle = "#14100c";
    ctx.fillRect(0, 0, layout.width + PAD * 2, layout.height + PAD * 2);
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
      const pPos = layout.pos[parentId];
      if (!pPos) return;
      const px = pPos.x + NODE_W / 2;
      const py = pPos.y + CIRCLE;
      const kidPts = kids
        .map((k) => layout.pos[k.id])
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

    // Узлы: круг + инициал + имя + годы
    for (const person of people) {
      const p = layout.pos[person.id];
      if (!p) continue;
      const cx = p.x + NODE_W / 2;
      const cy = p.y + CIRCLE / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, CIRCLE / 2, 0, Math.PI * 2);
      ctx.fillStyle = "#2a2216";
      ctx.fill();
      ctx.strokeStyle = "#c9a227";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#c9a227";
      ctx.font = "bold 26px Georgia, serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(person.name.charAt(0), cx, cy + 2);

      ctx.fillStyle = "#f2ecdd";
      ctx.font = "600 12px Arial, sans-serif";
      ctx.textBaseline = "top";
      // имя в две строки максимум
      const words = person.name.split(" ");
      const line1 = words.slice(0, 2).join(" ");
      const line2 = words.slice(2).join(" ");
      ctx.fillText(line1, cx, p.y + CIRCLE + 6, NODE_W);
      if (line2) ctx.fillText(line2, cx, p.y + CIRCLE + 20, NODE_W);
      const years = person.birth
        ? `${person.birth}${person.death ? `–${person.death}` : ""}`
        : "";
      if (years) {
        ctx.fillStyle = "#a99a78";
        ctx.font = "10px Arial, sans-serif";
        ctx.fillText(years, cx, p.y + CIRCLE + (line2 ? 34 : 20));
      }
    }

    const a = document.createElement("a");
    a.download = "vorhda-drevo.png";
    a.href = canvas.toDataURL("image/png");
    a.click();
  }, [people, layout]);

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

              {/* пунктирные связи к плейсхолдерам «+» */}
              {selected && layout.pos[selected.id]
                ? addSlots.map((slot) => {
                    const sp = layout.pos[selected.id];
                    const x1 = sp.x + NODE_W / 2;
                    const y1 = sp.y + CIRCLE / 2;
                    const x2 = slot.x + NODE_W / 2;
                    const y2 = slot.y + CIRCLE / 2;
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

            {/* узлы древа: круглые аватарки с подписью (абсолютная раскладка) */}
            <div className="relative z-10">
              {people.map((person) => {
                const isSelected = person.id === selectedId;
                const isAncestor = ancestorIds.has(person.id);
                const isLiving = !person.death;
                const p = layout.pos[person.id];
                if (!p) return null;
                return (
                  <button
                    key={person.id}
                    ref={(el) => {
                      nodeRefs.current[person.id] = el;
                    }}
                    type="button"
                    onClick={() => onSelect(person.id)}
                    style={{
                      position: "absolute",
                      left: p.x,
                      top: p.y,
                      width: NODE_W,
                    }}
                    className="group flex flex-col items-center text-center"
                  >
                    <span className="relative">
                      <span
                        className={cn(
                          "flex items-center justify-center rounded-full border-2 font-serif text-2xl font-bold transition-all duration-200",
                          isSelected
                            ? "border-primary bg-primary/15 text-primary shadow-[0_0_0_4px_rgb(var(--primary)/0.18)]"
                            : isAncestor
                              ? "border-primary/60 bg-secondary text-primary"
                              : "border-border bg-secondary text-primary group-hover:border-primary/50",
                        )}
                        style={{
                          width: CIRCLE,
                          height: CIRCLE,
                          display: "flex",
                        }}
                      >
                        {person.name.charAt(0)}
                      </span>
                      {/* Бейдж роли на аватарке (как на Familio) */}
                      {person.role && person.role !== "—" ? (
                        <span
                          className={cn(
                            "absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 py-px text-[9px] font-semibold leading-tight",
                            roleBadgeClass(person.role),
                          )}
                        >
                          {person.role}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1.5 line-clamp-2 w-full text-xs font-medium leading-tight text-foreground">
                      {person.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {person.birth
                        ? `${person.birth}${person.death ? `–${person.death}` : ""}`
                        : isLiving
                          ? ""
                          : `†${person.death}`}
                    </span>
                  </button>
                );
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
                  }}
                  className="group flex flex-col items-center text-center"
                  aria-label={`Добавить: ${ADD_LABEL[slot.rel]}`}
                >
                  <span
                    className="flex items-center justify-center rounded-full border-2 border-dashed border-border bg-card/60 text-2xl font-light text-muted-foreground transition-all duration-200 group-hover:border-primary/60 group-hover:text-primary"
                    style={{ width: CIRCLE, height: CIRCLE }}
                  >
                    +
                  </span>
                  <span className="mt-1.5 text-xs text-muted-foreground transition-colors group-hover:text-primary">
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
