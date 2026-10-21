import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type NativeTouchEvent,
} from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { getDecorTiles } from '../mock/demoCity/decor';
import { geoToLocal } from '../mock/demoCity/projection';
import {
  COMPOUNDS,
  LABELS,
  PARKS,
  PONDS,
  RIVER,
  ROAD_DRAW_ORDER,
  ROAD_STROKES,
  ROAD_WIDTH,
  WORLD_BOUNDS,
  type MapLabel,
} from '../mock/demoCity/mapLayers';
import type { LocalPoint } from '../domain/geo';
import { colors, mapColors, radius, shadow, space } from '../design/tokens';
import { useFontScale } from '../hooks/useFontScale';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { Text } from '../ui/Text';
import { chooseChipAnchors, nearestRoute, splitPolyline } from './chipAnchor';
import {
  centerCamera,
  clampCamera,
  easeInOutCubic,
  fitCamera,
  lerpCamera,
  project,
  sameCamera,
  unproject,
  type Camera,
  type ScaleLimits,
  type Size,
} from './camera';
import { NO_INSETS, type CameraRequest, type Insets, type MapAdapterProps, type MapMarker } from './MapAdapter';

/** 지도 전체 도시의 범위 (오버뷰에서 한 화면에 담는 영역) */
const CITY_EXTENT: LocalPoint[] = [
  { x: 450, y: 500 },
  { x: 10050, y: 6450 },
];
const MAX_SCALE = 0.55;
const FOLLOW_DEFAULT_SCALE = 0.2;
/** 오른쪽 확대·축소 컨트롤 열의 폭. 경로와 라벨이 컨트롤 아래에 깔리지 않도록 보이는 영역에서 뺀다 */
const CONTROLS_WIDTH = 64;
/** 이 확대율(px/m)보다 멀리서 보면 골목은 그리지 않는다 */
const STREETS_MIN_SCALE = 0.016;
/** 이 확대율보다 멀리서 보면 건물 윗면은 점이 되므로 그리지 않는다 */
const BUILDINGS_MIN_SCALE = 0.06;
/** 경로 위 진행 방향 화살표 사이의 화면 간격(px) */
const ARROW_GAP_PX = 64;
/** 이 확대율보다 멀리서 보면 통행 제한 표시는 의미 없는 얼룩이 되므로 그리지 않는다 */
const RESTRICTED_MIN_SCALE = 0.045;
/** 지도를 눌렀을 때 경로로 인정하는 거리(px) */
const TAP_RADIUS_PX = 26;
const ZOOM_STEP = 1.6;

const WORLD_W = WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX;
const WORLD_H = WORLD_BOUNDS.maxY - WORLD_BOUNDS.minY;

/** 제스처로 줄일 수 있는 한계: 도시 전체가 화면에 들어오는 배율보다 조금 더 멀리까지 */
function limitsFor(size: Size): ScaleLimits {
  return { min: Math.min(size.w / WORLD_W, size.h / WORLD_H) * 0.8, max: MAX_SCALE };
}

/** 경로·도시를 보이는 영역에 맞출 때의 한계. 영역이 좁으면 더 작게 맞춰야 하므로 하한을 거의 두지 않는다 */
const FIT_LIMITS: ScaleLimits = { min: 0.004, max: MAX_SCALE };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// ───────────────────────── SVG 경로 문자열 ─────────────────────────

function pathD(points: readonly LocalPoint[], cam: Camera, size: Size, close = false): string {
  if (points.length === 0) return '';
  let d = '';
  points.forEach((pt, i) => {
    const s = project(pt, cam, size);
    d += `${i === 0 ? 'M' : 'L'}${s.x.toFixed(1)} ${s.y.toFixed(1)} `;
  });
  return close ? `${d}Z` : d;
}

function roadWidthPx(cls: keyof typeof ROAD_WIDTH, scale: number): number {
  const w = ROAD_WIDTH[cls];
  return clamp(w.meters * scale, w.minPx, w.maxPx);
}

// ───────────────────────── 라벨 배치 ─────────────────────────

const LABEL_STYLE: Record<MapLabel['kind'], { size: number; weight: '400' | '600' | '700'; color: string; spacing: number }> = {
  district: { size: 14, weight: '600', color: mapColors.labelMuted, spacing: 3 },
  place: { size: 13, weight: '700', color: mapColors.label, spacing: 0 },
  road: { size: 11.5, weight: '600', color: mapColors.labelMuted, spacing: 0 },
  water: { size: 12.5, weight: '600', color: mapColors.labelWater, spacing: 2 },
  note: { size: 11.5, weight: '700', color: colors.caution, spacing: 0 },
};

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/** 마커(고리·핀·차량)와 그 이름표가 차지하는 영역. 같은 자리의 지명 라벨은 그리지 않는다. */
function markerBoxes(markers: Array<{ marker: MapMarker; at: LocalPoint }>, cam: Camera, size: Size): Box[] {
  return markers.map(({ marker, at }) => {
    const s = project(at, cam, size);
    if (marker.kind === 'destination') return { x0: s.x - 22, x1: s.x + 22, y0: s.y - 46, y1: s.y + 26 };
    if (marker.kind === 'vehicle') return { x0: s.x - 26, x1: s.x + 26, y0: s.y - 26, y1: s.y + 26 };
    return { x0: s.x - 28, x1: s.x + 28, y0: s.y - 18, y1: s.y + 38 };
  });
}

const NO_BOXES: Box[] = [];

/**
 * 경로 칩이 차지하는 영역을 글자 수로 어림잡는 값(px). 같은 자리의 지명 라벨은 그리지 않는다.
 * 웹에서 잰 크기(선택 92×34, 비선택 73×34, 글자 7개)에 맞췄고, 글자 배율이 커지면 같이 키운다.
 */
const CHIP_BASE_W = 27;
const CHIP_CHECK_W = 19;
const CHIP_CHAR_W = 6.6;
const CHIP_MARGIN = 3;
const CHIP_HALF_H = 17;

/** 경로 칩의 화면 위치(중심). 지도를 가린 영역 안쪽으로 눌러 담는다. */
function chipCenter(anchor: LocalPoint, cam: Camera, size: Size, reserved: Insets): { x: number; y: number } {
  const at = project(anchor, cam, size);
  return {
    x: clamp(at.x, reserved.left + 64, size.w - reserved.right - 64),
    y: clamp(at.y, reserved.top + 24, size.h - reserved.bottom - 24),
  };
}

function layoutLabels(cam: Camera, size: Size, reserved: Box[]): Array<{ label: MapLabel; x: number; y: number }> {
  const accepted: Box[] = [...reserved];
  const out: Array<{ label: MapLabel; x: number; y: number }> = [];
  const sorted = [...LABELS].sort((a, b) => a.priority - b.priority);
  for (const label of sorted) {
    if (cam.scale < label.minScale) continue;
    const s = project(label.at, cam, size);
    const style = LABEL_STYLE[label.kind];
    const width = [...label.text].length * (style.size * 0.98 + style.spacing);
    const box: Box = { x0: s.x - width / 2 - 3, x1: s.x + width / 2 + 3, y0: s.y - style.size, y1: s.y + 4 };
    if (box.x1 < 0 || box.x0 > size.w || box.y1 < 0 || box.y0 > size.h) continue;
    if (accepted.some((b) => overlaps(b, box))) continue;
    accepted.push(box);
    out.push({ label, x: s.x, y: s.y });
  }
  return out;
}

// ───────────────────────── 마커 ─────────────────────────

const PIN_PATH = 'M0 0 C-3 -9 -13 -15 -13 -26 A13 13 0 1 1 13 -26 C13 -15 3 -9 0 0 Z';
const ARROW_PATH = 'M0 -9 L7 7 L0 3.5 L-7 7 Z';

function MarkerGlyph({ marker, x, y }: { marker: MapMarker; x: number; y: number }) {
  if (marker.kind === 'origin') {
    return (
      <G x={x} y={y}>
        <Circle r={10} fill={colors.surface} stroke={mapColors.origin} strokeWidth={4.5} />
      </G>
    );
  }
  if (marker.kind === 'destination') {
    return (
      <G x={x} y={y}>
        <Path d={PIN_PATH} fill={mapColors.origin} stroke={colors.surface} strokeWidth={2.5} />
        <Circle cx={0} cy={-26} r={5} fill={colors.surface} />
      </G>
    );
  }
  return (
    <G x={x} y={y}>
      <Circle r={19} fill={mapColors.vehicle} opacity={0.18} />
      <Circle r={15} fill={mapColors.vehicle} stroke={colors.surface} strokeWidth={3} />
      <G rotation={marker.headingDeg ?? 0}>
        <Path d={ARROW_PATH} fill={colors.surface} />
      </G>
    </G>
  );
}

function HaloText({ x, y, text, size, weight, color, spacing = 0, anchor = 'middle' }: { x: number; y: number; text: string; size: number; weight: '400' | '600' | '700'; color: string; spacing?: number; anchor?: 'start' | 'middle' | 'end' }) {
  const common = { x, y, fontSize: size, fontWeight: weight, textAnchor: anchor, letterSpacing: spacing };
  return (
    <>
      <SvgText {...common} fill={mapColors.labelHalo} stroke={mapColors.labelHalo} strokeWidth={3.4} strokeLinejoin="round">
        {text}
      </SvgText>
      <SvgText {...common} fill={color}>
        {text}
      </SvgText>
    </>
  );
}

// ───────────────────────── 장식 배경(골목·건물) ─────────────────────────

const TileStreets = memo(function TileStreets({ d, width, casing, opacity }: { d: string; width: number; casing: boolean; opacity: number }) {
  return (
    <Path
      d={d}
      stroke={casing ? mapColors.streetCasing : mapColors.streetMinor}
      strokeWidth={width}
      strokeLinecap="round"
      strokeOpacity={opacity}
      fill="none"
    />
  );
});

const TileBuildings = memo(function TileBuildings({ d }: { d: string }) {
  return <Path d={d} fill={mapColors.building} />;
});

/**
 * 골목과 건물 같은 장식 배경. 세계 좌표 그대로 그리고 변환 한 번으로 화면에 맞춘다.
 * 지도를 끌 때는 경로 문자열을 다시 만들지 않고, 화면에 보이는 구역(타일)만 그린다.
 */
function DecorLayer({ cam, size }: { cam: Camera; size: Size }) {
  const s = cam.scale;
  if (s < STREETS_MIN_SCALE) return null;
  const halfW = size.w / 2 / s + 450;
  const halfH = size.h / 2 / s + 450;
  const tiles = getDecorTiles().filter(
    (t) => t.maxX >= cam.cx - halfW && t.minX <= cam.cx + halfW && t.maxY >= cam.cy - halfH && t.minY <= cam.cy + halfH,
  );
  // 선 굵기는 화면에서 같은 두께로 보이도록 세계 좌표 변환의 배율만큼 나눠 준다 (0.25px 단위로 맞춰 불필요한 다시 그리기를 줄인다)
  const px = Math.round(clamp(10 * s, 1, 3) * 4) / 4;
  // 멀리서는 방안지처럼 보이지 않도록 테두리를 빼고 선을 연하게 한다
  const far = s < 0.045;
  const farOpacity = far ? Math.max(0.35, (s - STREETS_MIN_SCALE) / (0.045 - STREETS_MIN_SCALE)) : 1;
  const matrix = `matrix(${s} 0 0 ${-s} ${size.w / 2 - cam.cx * s} ${size.h / 2 + cam.cy * s})`;
  return (
    <G transform={matrix}>
      {far
        ? null
        : tiles.map((t) => <TileStreets key={`c${t.minX}:${t.minY}`} d={t.streets} width={(px + 1.6) / s} casing opacity={1} />)}
      {tiles.map((t) => (
        <TileStreets key={`f${t.minX}:${t.minY}`} d={t.streets} width={px / s} casing={false} opacity={farOpacity} />
      ))}
      {s >= BUILDINGS_MIN_SCALE ? tiles.map((t) => <TileBuildings key={`b${t.minX}:${t.minY}`} d={t.buildings} />) : null}
    </G>
  );
}

/** 경로선 위에 일정한 화면 간격으로 진행 방향을 가리키는 작은 화살표(꺾쇠)를 그린다 */
function arrowsD(points: readonly LocalPoint[], cam: Camera, size: Size): string {
  if (points.length < 2) return '';
  let d = '';
  let carry = ARROW_GAP_PX / 2;
  let prev = project(points[0]!, cam, size);
  for (let i = 1; i < points.length; i++) {
    const cur = project(points[i]!, cam, size);
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      const ux = dx / len;
      const uy = dy / len;
      let at = carry;
      while (at <= len) {
        const x = prev.x + ux * at;
        const y = prev.y + uy * at;
        if (x > -20 && x < size.w + 20 && y > -20 && y < size.h + 20) {
          const tipX = x + ux * 3.2;
          const tipY = y + uy * 3.2;
          const baseX = x - ux * 2.6;
          const baseY = y - uy * 2.6;
          const nx = -uy * 3.6;
          const ny = ux * 3.6;
          d += `M${(baseX + nx).toFixed(1)} ${(baseY + ny).toFixed(1)}L${tipX.toFixed(1)} ${tipY.toFixed(1)}L${(baseX - nx).toFixed(1)} ${(baseY - ny).toFixed(1)}`;
        }
        at += ARROW_GAP_PX;
      }
      carry = at - len;
    }
    prev = cur;
  }
  return d;
}

// ───────────────────────── SVG 본체 ─────────────────────────

interface WorldRoute {
  id: string;
  selected: boolean;
  points: LocalPoint[];
  traveledM?: number;
}

interface MapSvgProps {
  cam: Camera;
  size: Size;
  routes: WorldRoute[];
  markers: Array<{ marker: MapMarker; at: LocalPoint }>;
  /** 지도 위에 떠 있는 요소(경로 칩)가 차지하는 영역. 라벨이 그 밑에 깔리지 않게 비워 둔다 */
  reservedBoxes: Box[];
}

const MapSvg = memo(function MapSvg({ cam, size, routes, markers, reservedBoxes }: MapSvgProps) {
  const labels = useMemo(
    () => layoutLabels(cam, size, [...markerBoxes(markers, cam, size), ...reservedBoxes]),
    [cam, size, markers, reservedBoxes],
  );
  const roadsByClass = useMemo(() => {
    const result = new Map<string, string>();
    for (const cls of ROAD_DRAW_ORDER) {
      const d = ROAD_STROKES.filter((s) => s.cls === cls && !s.restricted)
        .map((s) => pathD(s.points, cam, size))
        .join('');
      result.set(cls, d);
    }
    return result;
  }, [cam, size]);
  const restricted = useMemo(
    () => ROAD_STROKES.filter((s) => s.restricted).map((s) => pathD(s.points, cam, size)).join(''),
    [cam, size],
  );

  const selectedRoutes = routes.filter((r) => r.selected);
  const otherRoutes = routes.filter((r) => !r.selected);
  const riverPx = Math.max(7, RIVER.width * cam.scale);

  const drawRoute = (route: WorldRoute, selected: boolean) => {
    const widthMain = selected ? 9 : 7;
    const widthCasing = selected ? 14 : 11;
    const mainColor = selected ? mapColors.routeSelected : mapColors.routeAlt;
    const split = route.traveledM && route.traveledM > 0 ? splitPolyline(route.points, route.traveledM) : null;
    const remaining = split ? split[1] : route.points;
    return (
      <G key={route.id}>
        <Path d={pathD(route.points, cam, size)} stroke={mapColors.routeSelectedCasing} strokeWidth={widthCasing} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        {split && split[0].length > 1 ? (
          <Path d={pathD(split[0], cam, size)} stroke={mapColors.traveled} strokeWidth={widthMain} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        ) : null}
        {remaining.length > 1 ? (
          <Path d={pathD(remaining, cam, size)} stroke={mainColor} strokeWidth={widthMain} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        ) : null}
        {selected && remaining.length > 1 ? (
          <Path d={arrowsD(remaining, cam, size)} stroke="#FFFFFF" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        ) : null}
      </G>
    );
  };

  return (
    <Svg width={size.w} height={size.h}>
      <Rect width={size.w} height={size.h} fill={mapColors.land} />

      {COMPOUNDS.map((c) => (
        <Path key={c.id} d={pathD(c.points, cam, size, true)} fill={c.kind === 'campus' ? mapColors.campus : mapColors.block} />
      ))}
      <DecorLayer cam={cam} size={size} />
      {PARKS.map((park, i) => (
        <Path key={`park-${i}`} d={pathD(park, cam, size, true)} fill={mapColors.park} />
      ))}
      {PONDS.map((pond, i) => (
        <Path key={`pond-${i}`} d={pathD(pond, cam, size, true)} fill={mapColors.water} />
      ))}
      <Path d={pathD(RIVER.line, cam, size)} stroke={mapColors.water} strokeWidth={riverPx} strokeLinecap="round" strokeLinejoin="round" fill="none" />

      {/* 도로: 바깥 테두리를 먼저 모두 그리고 그 위에 안쪽 면을 그려 교차로가 매끄럽게 이어지게 한다 */}
      {ROAD_DRAW_ORDER.map((cls) => (
        <Path
          key={`casing-${cls}`}
          d={roadsByClass.get(cls) ?? ''}
          stroke={cls === 'highway' || cls === 'ramp' ? mapColors.highwayCasing : mapColors.roadCasing}
          strokeWidth={roadWidthPx(cls, cam.scale) + 2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
      {ROAD_DRAW_ORDER.map((cls) => (
        <Path
          key={`fill-${cls}`}
          d={roadsByClass.get(cls) ?? ''}
          stroke={cls === 'highway' || cls === 'ramp' ? mapColors.highwayFill : mapColors.roadFill}
          strokeWidth={roadWidthPx(cls, cam.scale)}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
      {restricted && cam.scale >= RESTRICTED_MIN_SCALE ? (
        <Path d={restricted} stroke="#D08A12" strokeWidth={4} strokeDasharray="7 5" strokeLinecap="butt" fill="none" />
      ) : null}

      {labels.map(({ label, x, y }) => {
        const st = LABEL_STYLE[label.kind];
        return <HaloText key={label.text} x={x} y={y} text={label.text} size={st.size} weight={st.weight} color={st.color} spacing={st.spacing} />;
      })}

      {otherRoutes.map((r) => drawRoute(r, false))}
      {selectedRoutes.map((r) => drawRoute(r, true))}

      {markers.map(({ marker, at }) => {
        const s = project(at, cam, size);
        return (
          <G key={marker.id}>
            <MarkerGlyph marker={marker} x={s.x} y={s.y} />
            {marker.label ? (
              <HaloText
                x={s.x}
                y={marker.kind === 'destination' ? s.y + 17 : s.y + 26}
                text={marker.label}
                size={12.5}
                weight="700"
                color={mapColors.label}
              />
            ) : null}
          </G>
        );
      })}
    </Svg>
  );
});

// ───────────────────────── 제스처 ─────────────────────────

function touchDistance(t: readonly NativeTouchEvent[]): number {
  return Math.hypot(t[0]!.pageX - t[1]!.pageX, t[0]!.pageY - t[1]!.pageY);
}

function touchMid(t: readonly NativeTouchEvent[]): { x: number; y: number } {
  return { x: (t[0]!.pageX + t[1]!.pageX) / 2, y: (t[0]!.pageY + t[1]!.pageY) / 2 };
}

// ───────────────────────── 지도 컴포넌트 ─────────────────────────

/**
 * 가상 도시의 데모 지도. 실제 지도 SDK 가 아니며, 실제 도로의 통행 가능 여부를 검증한 지도가 아니다.
 * 경로 선택·강조, 출발·도착·현재 위치 표시, 끌기·확대·축소를 지원한다. 지도는 회전하지 않는다.
 */
export function DemoMapView({
  routes,
  markers,
  camera: request,
  insets = NO_INSETS,
  onRoutePress,
  interactive = true,
  accessibilityLabel,
  testID,
}: MapAdapterProps) {
  const reducedMotion = useReducedMotion();
  const fontScale = useFontScale();
  const [size, setSize] = useState<Size | null>(null);
  const [cam, setCam] = useState<Camera | null>(null);
  /** 사용자가 지도를 끌거나 확대·축소해서 요청한 화면에서 벗어났는지. 벗어났을 때만 "처음 화면으로 돌아가기"를 보여준다 */
  const [moved, setMoved] = useState(false);
  const camRef = useRef<Camera | null>(null);
  const rootRef = useRef<View>(null);
  const raf = useRef<number | null>(null);
  const appliedKey = useRef<string>('');
  const gesture = useRef<{ base: Camera; dist: number; mid: { x: number; y: number }; touches: number } | null>(null);

  const apply = useCallback((next: Camera) => {
    camRef.current = next;
    setCam(next);
  }, []);

  const cancelAnimation = useCallback(() => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
  }, []);

  const animateTo = useCallback(
    (target: Camera, duration = 380) => {
      cancelAnimation();
      const from = camRef.current;
      if (!from || reducedMotion || duration <= 0 || sameCamera(from, target)) {
        apply(target);
        return;
      }
      const startedAt = Date.now();
      const step = () => {
        const t = Math.min(1, (Date.now() - startedAt) / duration);
        apply(lerpCamera(from, target, easeInOutCubic(t)));
        raf.current = t < 1 ? requestAnimationFrame(step) : null;
      };
      raf.current = requestAnimationFrame(step);
    },
    [apply, cancelAnimation, reducedMotion],
  );

  // 컨트롤 열은 지도 위에 떠 있으므로 보이는 영역에서 그만큼 뺀 안쪽에 경로를 맞춘다
  const reserved: Insets = {
    top: insets.top + space.sm,
    bottom: insets.bottom,
    left: insets.left,
    right: insets.right + (interactive ? CONTROLS_WIDTH : 0),
  };

  const worldRoutes = useMemo<WorldRoute[]>(
    () => routes.map((r) => ({ id: r.id, selected: r.selected, points: r.path.map(geoToLocal), traveledM: r.traveledM })),
    [routes],
  );
  const worldMarkers = useMemo(() => markers.map((marker) => ({ marker, at: geoToLocal(marker.point) })), [markers]);
  const chipAnchors = useMemo(
    () => chooseChipAnchors(worldRoutes.map((r) => ({ id: r.id, points: r.points }))),
    // 칩 위치는 경로 형태가 같으면 그대로여야 하므로 id 와 길이로만 판단한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [worldRoutes.map((r) => `${r.id}:${r.points.length}`).join('|')],
  );
  const chipSpecs = routes
    .filter((r) => r.chipText && chipAnchors[r.id])
    .map((r) => ({ id: r.id, selected: r.selected, chars: [...(r.chipText ?? '')].length }));
  const chipKey = chipSpecs.map((c) => `${c.id}:${c.selected ? 1 : 0}:${c.chars}`).join('|');
  const chipScale = clamp(fontScale, 1, 1.6);
  // 칩 자리의 지명 라벨은 비운다. 칩이 같은 값이면 같은 배열을 줘서 SVG 가 불필요하게 다시 그려지지 않게 한다
  const chipBoxes = useMemo<Box[]>(() => {
    if (!size || !cam || chipSpecs.length === 0) return NO_BOXES;
    return chipSpecs.map((chip) => {
      const c = chipCenter(chipAnchors[chip.id]!, cam, size, reserved);
      const halfW = ((CHIP_BASE_W + (chip.selected ? CHIP_CHECK_W : 0) + chip.chars * CHIP_CHAR_W) / 2 + CHIP_MARGIN) * chipScale;
      const halfH = CHIP_HALF_H * chipScale;
      return { x0: c.x - halfW, x1: c.x + halfW, y0: c.y - halfH, y1: c.y + halfH };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chipKey, chipAnchors, cam, size, reserved.top, reserved.bottom, reserved.left, reserved.right, chipScale]);

  const targetFor = useCallback(
    (req: CameraRequest, s: Size, ins: Insets): Camera => {
      if (req.type === 'overview') return fitCamera(CITY_EXTENT, s, ins, FIT_LIMITS, 12);
      if (req.type === 'fit') return fitCamera(req.points.map(geoToLocal), s, ins, FIT_LIMITS);
      return centerCamera(geoToLocal(req.point), req.scale ?? FOLLOW_DEFAULT_SCALE, s, ins);
    },
    [],
  );

  const latest = useRef({ size, request, insets: reserved, interactive, targetFor, routes: worldRoutes });
  latest.current = { size, request, insets: reserved, interactive, targetFor, routes: worldRoutes };

  // 요청(key)·화면 크기·가려진 영역이 바뀌면 카메라를 맞춘다. follow 는 애니메이션 없이 매번 따라간다.
  const signature = size
    ? `${request.type}:${request.key}:${Math.round(size.w)}x${Math.round(size.h)}:${Math.round(reserved.top)}/${Math.round(reserved.bottom)}/${Math.round(reserved.left)}/${Math.round(reserved.right)}`
    : '';
  useEffect(() => {
    if (!size) return;
    if (request.type === 'follow') {
      cancelAnimation();
      apply(targetFor(request, size, reserved));
      return;
    }
    if (appliedKey.current === signature) return;
    const first = appliedKey.current === '';
    appliedKey.current = signature;
    setMoved(false);
    const target = targetFor(request, size, reserved);
    if (first) apply(target);
    else animateTo(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, request.type === 'follow' ? (request as { point: unknown }).point : null]);

  useEffect(() => cancelAnimation, [cancelAnimation]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev && Math.abs(prev.w - width) < 1 && Math.abs(prev.h - height) < 1 ? prev : { w: width, h: height }));
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onPanResponderTerminationRequest: () => false,
        onMoveShouldSetPanResponder: (e, g) =>
          latest.current.interactive && (e.nativeEvent.touches.length >= 2 || Math.abs(g.dx) + Math.abs(g.dy) > 6),
        onPanResponderGrant: (e) => {
          cancelAnimation();
          const touches = e.nativeEvent.touches;
          if (camRef.current) {
            gesture.current = {
              base: camRef.current,
              dist: touches.length >= 2 ? touchDistance(touches) : 0,
              mid: touches.length >= 2 ? touchMid(touches) : { x: 0, y: 0 },
              touches: touches.length,
            };
          }
        },
        onPanResponderMove: (e, g) => {
          const s = latest.current.size;
          const state = gesture.current;
          if (!s || !state) return;
          const touches = e.nativeEvent.touches;
          const limits = limitsFor(s);
          let next: Camera;
          if (touches.length >= 2) {
            if (state.touches < 2) {
              // 두 번째 손가락이 닿으면 지금 카메라를 기준으로 다시 시작한다
              gesture.current = { base: camRef.current ?? state.base, dist: touchDistance(touches), mid: touchMid(touches), touches: 2 };
              return;
            }
            const mid = touchMid(touches);
            const scale = clamp(state.base.scale * (touchDistance(touches) / state.dist), limits.min, limits.max);
            next = {
              scale,
              cx: state.base.cx - (mid.x - state.mid.x) / scale,
              cy: state.base.cy + (mid.y - state.mid.y) / scale,
            };
          } else {
            if (state.touches >= 2) return;
            next = { ...state.base, cx: state.base.cx - g.dx / state.base.scale, cy: state.base.cy + g.dy / state.base.scale };
          }
          setMoved(true);
          apply(clampCamera(next, limits, WORLD_BOUNDS));
        },
        onPanResponderRelease: () => {
          gesture.current = null;
        },
        onPanResponderTerminate: () => {
          gesture.current = null;
        },
      }),
    [apply, cancelAnimation],
  );

  const zoomBy = (factor: number) => {
    const base = camRef.current;
    const s = latest.current.size;
    if (!base || !s) return;
    const limits = limitsFor(s);
    setMoved(true);
    animateTo({ ...base, scale: clamp(base.scale * factor, limits.min, limits.max) }, 220);
  };

  const refit = () => {
    const s = latest.current.size;
    if (!s) return;
    const { request: req, insets: ins, targetFor: fn } = latest.current;
    setMoved(false);
    animateTo(fn(req, s, ins));
  };

  /**
   * 지도를 짧게 눌렀을 때 가까운 대안 경로를 고른다. SVG 도형의 onPress 는 웹에서 동작하지 않아서
   * 지도 전체의 탭 위치를 세계 좌표로 바꿔 직접 찾는다 (iOS·Android·웹 공통).
   */
  const handleTap = (e: GestureResponderEvent) => {
    if (!interactive || !onRoutePress) return;
    const { pageX, pageY } = e.nativeEvent;
    rootRef.current?.measureInWindow((x, y) => {
      const s = latest.current.size;
      const c = camRef.current;
      if (!s || !c) return;
      const point = unproject(pageX - x, pageY - y, c, s);
      const alternatives = latest.current.routes.filter((r) => !r.selected);
      const hit = nearestRoute(alternatives, point, TAP_RADIUS_PX / c.scale);
      if (hit) onRoutePress(hit);
    });
  };

  const topOffset = insets.top + space.sm;

  return (
    <View ref={rootRef} testID={testID} style={styles.root} onLayout={onLayout}>
      <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={styles.srOnly} />
      <View
        style={StyleSheet.absoluteFill}
        aria-hidden
        {...(interactive ? pan.panHandlers : {})}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleTap} accessible={false} focusable={false}>
          {size && cam ? <MapSvg cam={cam} size={size} routes={worldRoutes} markers={worldMarkers} reservedBoxes={chipBoxes} /> : null}
        </Pressable>
      </View>

      {size && cam
        ? routes
            .filter((r) => r.chipText && chipAnchors[r.id])
            .map((r) => {
              const { x, y } = chipCenter(chipAnchors[r.id]!, cam, size, reserved);
              const selectable = Boolean(onRoutePress) && interactive;
              return (
                <View key={`chip-${r.id}`} style={[styles.chipWrap, { left: x - 70, top: y - 20 }]}>
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityLabel={`${r.label} 경로 ${r.chipText}`}
                    aria-checked={r.selected}
                    disabled={!selectable}
                    onPress={() => onRoutePress?.(r.id)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    style={[styles.chip, shadow.floating, r.selected ? styles.chipSelected : styles.chipIdle]}
                  >
                    {r.selected ? <Icon name="check" size={14} color={colors.onPrimary} strokeWidth={3} /> : null}
                    <Text variant="captionStrong" color={r.selected ? colors.onPrimary : colors.text}>
                      {r.chipText}
                    </Text>
                  </Pressable>
                </View>
              );
            })
        : null}

      <View style={[styles.attribution, { bottom: insets.bottom + space.sm }]}>
        <Text variant="micro" color={colors.textTertiary}>
          시연용 지도
        </Text>
      </View>

      {interactive && size && size.h - reserved.top - reserved.bottom >= 150 ? (
        <View style={[styles.controls, { top: topOffset }]}>
          <IconButton icon="plus" label="지도 확대" variant="floating" onPress={() => zoomBy(ZOOM_STEP)} />
          <IconButton icon="minus" label="지도 축소" variant="floating" onPress={() => zoomBy(1 / ZOOM_STEP)} />
          {moved ? (
            <IconButton icon="locate" label="처음 화면으로 돌아가기" variant="floating" onPress={refit} iconColor={colors.primary} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: mapColors.land, overflow: 'hidden' },
  srOnly: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  chipWrap: { position: 'absolute', width: 140, alignItems: 'center', pointerEvents: 'box-none' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 34,
    paddingHorizontal: space.md,
    paddingVertical: 4,
    borderRadius: radius.round,
    borderWidth: 1,
  },
  chipIdle: { backgroundColor: colors.surface, borderColor: colors.border },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  attribution: {
    position: 'absolute',
    right: space.md,
    paddingHorizontal: space.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.round,
    backgroundColor: 'rgba(255,255,255,0.82)',
    pointerEvents: 'none',
  },
  controls: { position: 'absolute', right: space.md, gap: space.sm, pointerEvents: 'box-none' },
});
