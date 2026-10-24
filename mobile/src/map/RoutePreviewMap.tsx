import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { toLocal, type LocalPoint } from '../domain/geo';
import type { GeoPoint } from '../domain/types';
import { colors, mapColors, radius, shadow, space } from '../design/tokens';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { centerCamera, fitCamera, project, type Camera, type Size } from './camera';
import { chooseChipAnchors, splitPolyline, spreadChips } from './chipAnchor';
import { NO_INSETS, type MapAdapterProps } from './MapAdapter';

/**
 * 실제 지도 SDK 를 붙이기 전, 백엔드 경로를 확인하기 위한 임시 지도.
 * 배경 지도 없이 경로선·출발/도착·차량·경로 칩만 그린다. 데모 지도(DemoMapView)는 가상 도시(위·경도 0,0) 범위로
 * 카메라가 묶여 있어 실제 좌표의 경로를 보여 줄 수 없기 때문이다. 끌기·확대는 지원하지 않는다.
 * 실제 지도가 아니라는 표시("실제 지도 연결 전")를 항상 보여 준다.
 */

const LIMITS = { min: 0.002, max: 0.6 };
const FOLLOW_DEFAULT_SCALE = 0.2;
const GRID_M = 500;
const CHIP_HALF_H = 17;
const CHIP_CHAR_W = 6.6;
const CHIP_BASE_W = 27;
const CHIP_CHECK_W = 19;

const toPath = (points: readonly LocalPoint[]) =>
  points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

export function RoutePreviewMap({ routes, markers, camera, insets = NO_INSETS, onRoutePress, accessibilityLabel, testID }: MapAdapterProps) {
  const [size, setSize] = useState<Size | null>(null);

  // 투영 기준점: 경로 시작점(없으면 첫 마커). 주행 중에도 바뀌지 않도록 경로를 먼저 쓴다
  const anchor: GeoPoint = routes[0]?.path[0] ?? markers[0]?.point ?? { lat: 0, lng: 0 };
  const anchorKey = `${anchor.lat.toFixed(5)},${anchor.lng.toFixed(5)}`;
  const local = useMemo(() => (p: GeoPoint) => toLocal(p, anchor), [anchorKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const worldRoutes = useMemo(
    () => routes.map((r) => ({ ...r, points: r.path.map(local) })),
    [routes, local],
  );

  const cam: Camera | null = useMemo(() => {
    if (!size) return null;
    if (camera.type === 'follow') return centerCamera(local(camera.point), camera.scale ?? FOLLOW_DEFAULT_SCALE, size, insets);
    const pts =
      camera.type === 'fit'
        ? camera.points.map(local)
        : [...worldRoutes.flatMap((r) => r.points), ...markers.map((m) => local(m.point))];
    if (pts.length === 0) return { cx: 0, cy: 0, scale: FOLLOW_DEFAULT_SCALE };
    return fitCamera(pts, size, insets, LIMITS, 40);
  }, [size, camera, insets, local, worldRoutes, markers]);

  const chipAnchors = useMemo(() => chooseChipAnchors(worldRoutes.map((r) => ({ id: r.id, points: r.points }))), [worldRoutes]);

  if (!size || !cam) {
    return <View style={styles.root} testID={testID} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} />;
  }

  const screen = (p: LocalPoint) => project(p, cam, size);
  const ordered = [...worldRoutes].sort((a, b) => Number(a.selected) - Number(b.selected));

  // 축척을 느낄 수 있게 500m 격자를 옅게 깐다 (실제 도로가 아님)
  const grid: string[] = [];
  const left = cam.cx - size.w / 2 / cam.scale;
  const right = cam.cx + size.w / 2 / cam.scale;
  const bottom = cam.cy - size.h / 2 / cam.scale;
  const top = cam.cy + size.h / 2 / cam.scale;
  if ((right - left) / GRID_M < 80) {
    for (let x = Math.floor(left / GRID_M) * GRID_M; x <= right; x += GRID_M) {
      const a = screen({ x, y: bottom });
      grid.push(`M${a.x.toFixed(1)} 0V${size.h}`);
    }
    for (let y = Math.floor(bottom / GRID_M) * GRID_M; y <= top; y += GRID_M) {
      const a = screen({ x: left, y });
      grid.push(`M0 ${a.y.toFixed(1)}H${size.w}`);
    }
  }

  const chips = routes
    .filter((r) => r.chipText && chipAnchors[r.id])
    .map((r) => {
      const c = screen(chipAnchors[r.id]!);
      const chars = [...(r.chipText ?? '')].length;
      return { id: r.id, selected: r.selected, x: c.x, y: c.y, halfW: (CHIP_BASE_W + (r.selected ? CHIP_CHECK_W : 0) + chars * CHIP_CHAR_W) / 2 + 3, halfH: CHIP_HALF_H, route: r };
    });
  const offsets = spreadChips(chips, { top: insets.top, bottom: size.h - insets.bottom });

  return (
    <View
      style={styles.root}
      testID={testID}
      accessible
      accessibilityLabel={accessibilityLabel}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      <Svg width={size.w} height={size.h}>
        <Rect x={0} y={0} width={size.w} height={size.h} fill={mapColors.land} />
        {grid.length > 0 ? <Path d={grid.join('')} stroke={mapColors.block} strokeWidth={1} /> : null}
        {ordered.map((r) => {
          const pts = r.points.map(screen);
          const [traveled, rest] = r.traveledM ? splitPolyline(r.points, r.traveledM) : [[], r.points];
          const width = r.selected ? 7 : 5;
          return (
            <G key={r.id}>
              <Path d={toPath(pts)} stroke={r.selected ? mapColors.routeSelectedCasing : mapColors.routeAltCasing} strokeWidth={width + 4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              {traveled.length > 1 ? (
                <Path d={toPath(traveled.map(screen))} stroke={mapColors.traveled} strokeWidth={width} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              ) : null}
              <Path d={toPath(rest.map(screen))} stroke={r.selected ? mapColors.routeSelected : mapColors.routeAlt} strokeWidth={width} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </G>
          );
        })}
        {markers.map((m) => {
          const p = screen(local(m.point));
          if (m.kind === 'vehicle') {
            return (
              <G key={m.id} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${m.headingDeg ?? 0})`}>
                <Circle r={16} fill={colors.surface} />
                <Circle r={13} fill={mapColors.vehicle} />
                <Path d="M0 -7 L6 6 L0 3 L-6 6 Z" fill={colors.onPrimary} />
              </G>
            );
          }
          if (m.kind === 'destination') {
            return (
              <G key={m.id} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}>
                <Path d="M0 0 C-9 -13 -11 -18 -11 -23 A11 11 0 1 1 11 -23 C11 -18 9 -13 0 0 Z" fill={mapColors.destination} stroke={colors.surface} strokeWidth={2} />
                <Circle cy={-23} r={4} fill={colors.surface} />
              </G>
            );
          }
          return <Circle key={m.id} cx={p.x} cy={p.y} r={9} fill={colors.surface} stroke={mapColors.origin} strokeWidth={5} />;
        })}
      </Svg>

      {chips.map((c) => (
        <View key={`chip-${c.id}`} style={[styles.chipWrap, { left: c.x - 70, top: c.y - 20 + (offsets[c.id] ?? 0) }]}>
          <Pressable
            accessibilityRole="radio"
            accessibilityLabel={`${c.route.label} 경로 ${c.route.chipText}`}
            aria-checked={c.selected}
            disabled={!onRoutePress}
            onPress={() => onRoutePress?.(c.id)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={[styles.chip, shadow.floating, c.selected ? styles.chipSelected : styles.chipIdle]}
          >
            {c.selected ? <Icon name="check" size={14} color={colors.onPrimary} strokeWidth={3} /> : null}
            <Text variant="captionStrong" color={c.selected ? colors.onPrimary : colors.text}>
              {c.route.chipText}
            </Text>
          </Pressable>
        </View>
      ))}

      <View style={[styles.attribution, { bottom: insets.bottom + space.sm }]}>
        <Text variant="micro" color={colors.textTertiary}>
          실제 지도 연결 전 · 경로 모양만 보여요
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: mapColors.land, overflow: 'hidden' },
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
});
