import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { formatExtra, formatMinutes, placeLabel } from '../domain/format';
import type { RecommendationNotice, RouteCandidate } from '../domain/types';
import { colors, layout, radius, shadow, space } from '../design/tokens';
import { MapView, type CameraRequest, type MapMarker, type MapRoute } from '../map';
import type { RootScreenProps } from '../navigation/types';
import { useFontScale } from '../hooks/useFontScale';
import { useTripStore } from '../state/tripStore';
import { useUiStore } from '../state/uiStore';
import { LetterBadge } from '../ui/Badges';
import { BottomSheet } from '../ui/BottomSheet';
import { burdenLabel } from '../ui/BurdenMeter';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Icon } from '../ui/Icon';
import { Notice, type NoticeTone } from '../ui/Notice';
import { RouteCard } from '../ui/RouteCard';
import { ActionBar } from '../ui/Screen';
import { LoadingView, SkeletonBlock, StateView } from '../ui/StateViews';
import { Text } from '../ui/Text';

const NOTICE_TONE: Record<RecommendationNotice['kind'], NoticeTone> = {
  over_limit: 'caution',
  excluded_restricted: 'info',
  single_candidate: 'info',
  missing_info: 'unknown',
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** 요약 단계에서 보이는 "선택한 경로" 줄의 높이 */
const PEEK_SUMMARY_HEIGHT = 56;

/**
 * 경로 비교: 지도에서 후보를 보고, 바텀시트의 카드로 비교해 하나를 고른다.
 * 카드를 누르면 선택만 바뀌고 안내가 시작되지는 않는다. 선택한 경로에 대한 행동은 하단 버튼으로 모았다.
 * 지도·카드·하단 버튼의 선택 상태는 같은 저장소 값(selectedRouteId)에서 나온다.
 */
export function RouteCompareScreen({ navigation }: RootScreenProps<'RouteCompare'>) {
  const insets = useSafeAreaInsets();
  const { origin, destination, status, error, candidates, recommendation, selectedRouteId, recomputeNotice } = useTripStore(
    useShallow((s) => ({
      origin: s.origin,
      destination: s.destination,
      status: s.status,
      error: s.error,
      candidates: s.candidates,
      recommendation: s.recommendation,
      selectedRouteId: s.selectedRouteId,
      recomputeNotice: s.recomputeNotice,
    })),
  );
  const loadRoutes = useTripStore((s) => s.loadRoutes);
  const selectRoute = useTripStore((s) => s.selectRoute);
  const clearRecomputeNotice = useTripStore((s) => s.clearRecomputeNotice);
  const showToast = useUiStore((s) => s.showToast);
  // 큰 글자에서는 두 버튼을 세로로 쌓아 글자가 쪼개지지 않게 한다
  const stacked = useFontScale() > 1.3;

  const [areaHeight, setAreaHeight] = useState(0);
  const [overlayHeight, setOverlayHeight] = useState(0);
  const [titleRowHeight, setTitleRowHeight] = useState(48);
  const [sheetIndex, setSheetIndex] = useState(1);

  useEffect(() => {
    if (!destination) {
      navigation.goBack();
      return;
    }
    if (status === 'idle') void loadRoutes();
  }, [destination, status, loadRoutes, navigation]);

  useEffect(() => {
    if (!recomputeNotice) return;
    showToast(recomputeNotice, 'info');
    clearRecomputeNotice();
  }, [recomputeNotice, showToast, clearRecomputeNotice]);

  const ready = status === 'ready' && recommendation !== null;
  const items = useMemo(
    () =>
      ready
        ? recommendation.items
            .map((item) => ({ item, route: candidates.find((c) => c.id === item.routeId) }))
            .filter((x): x is { item: (typeof recommendation.items)[number]; route: RouteCandidate } => x.route !== undefined)
        : [],
    [ready, recommendation, candidates],
  );
  const selected = items.find((x) => x.route.id === selectedRouteId);
  const recommended = items.find((x) => x.item.isRecommended);

  // ── 시트 높이: 요약(손잡이+제목 줄+선택한 경로 요약) / 비교(절반) / 확장(검색창 아래까지)
  // 요약 줄은 접힌 상태에서만 보이지만, 그 높이를 미리 더해 두어야 끌었을 때 요약 단계를 정확히 판정한다
  const peek = 24 + titleRowHeight + (ready && selected ? PEEK_SUMMARY_HEIGHT + space.xs : 0) + space.sm;
  const full = Math.max(peek + 160, areaHeight - overlayHeight - space.sm);
  // 화면이 낮을수록 지도가 너무 좁아지지 않도록 비교 단계의 시트 높이를 줄인다
  const halfRatio = areaHeight < 620 ? 0.46 : areaHeight < 720 ? 0.52 : 0.58;
  const half = clamp(Math.round(areaHeight * halfRatio), peek + 140, Math.max(peek + 140, full - 80));
  const snapHeights = [peek, half, full];
  const visibleSheet = snapHeights[sheetIndex] ?? peek;

  const markers = useMemo<MapMarker[]>(
    () =>
      destination
        ? [
            { id: 'origin', kind: 'origin', point: origin.location, label: '출발' },
            { id: 'destination', kind: 'destination', point: destination.location, label: '도착' },
          ]
        : [],
    [origin, destination],
  );
  const mapRoutes = useMemo<MapRoute[]>(
    () =>
      items.map(({ item, route }) => ({
        id: route.id,
        label: route.label,
        path: route.path,
        selected: route.id === selectedRouteId,
        chipText: `${route.label} · ${formatMinutes(item.durationMinutes)}`,
      })),
    [items, selectedRouteId],
  );
  const camera = useMemo<CameraRequest>(() => {
    if (ready && candidates.length > 0) {
      return { type: 'fit', key: `compare:${candidates.map((c) => c.id).join(',')}`, points: candidates.flatMap((c) => c.path) };
    }
    return {
      type: 'fit',
      key: `compare-pre:${origin.id}:${destination?.id ?? ''}`,
      points: destination ? [origin.location, destination.location] : [origin.location],
    };
  }, [ready, candidates, origin, destination]);

  const title =
    status === 'loading' || status === 'idle'
      ? '경로를 찾는 중'
      : status === 'ready'
        ? `경로 ${candidates.length}개`
        : status === 'empty'
          ? '경로 없음'
          : '경로 조회 실패';

  const toggleLabel = sheetIndex === 0 ? '목록 보기' : sheetIndex === 1 ? '목록 크게 보기' : '지도 보기';
  const onToggle = () => setSheetIndex(sheetIndex === 0 ? 1 : sheetIndex === 1 ? 2 : 0);

  const openDetail = () => {
    if (selected) navigation.navigate('RouteDetail', { routeId: selected.route.id });
  };
  const startGuidance = () => {
    if (selected) navigation.navigate('Navigation', { routeId: selected.route.id });
  };

  const goSearchDestination = () => navigation.navigate('Search', { mode: 'destination' });

  return (
    <View style={styles.root}>
      <View style={styles.area} onLayout={(e) => setAreaHeight(e.nativeEvent.layout.height)}>
        <MapView
          routes={mapRoutes}
          markers={markers}
          camera={camera}
          insets={{ top: overlayHeight + space.sm, bottom: visibleSheet + space.sm, left: 0, right: 0 }}
          onRoutePress={selectRoute}
          accessibilityLabel={
            ready
              ? `지도에 경로 ${candidates.length}개가 표시되어 있어요. 아래 목록에서 경로를 선택할 수 있어요.`
              : '지도. 경로를 불러오는 중이에요.'
          }
          testID="compare-map"
        />

        <BottomSheet
          testID="compare-sheet"
          snapHeights={snapHeights}
          index={sheetIndex}
          onIndexChange={setSheetIndex}
          header={
            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitleRow} onLayout={(e) => setTitleRowHeight(e.nativeEvent.layout.height)}>
                <Text variant="lead" style={styles.sheetTitle} accessibilityRole="header">
                  {title}
                </Text>
                {ready ? <Button title={toggleLabel} variant="tertiary" size="small" fullWidth={false} onPress={onToggle} testID="sheet-toggle" /> : null}
              </View>
              {sheetIndex === 0 && selected ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityHint="누르면 경로 목록을 펼쳐요"
                  onPress={() => setSheetIndex(1)}
                  style={styles.peekSummary}
                >
                  <LetterBadge letter={selected.route.label} selected />
                  <View style={styles.peekText}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {selected.item.headline}
                    </Text>
                    <Text variant="caption" color={colors.textSecondary} numberOfLines={2}>
                      {formatMinutes(selected.item.durationMinutes)} · {formatExtra(selected.item.extraMinutes)} · 예상 운전 부담 {burdenLabel(selected.item.burdenLevel)}
                    </Text>
                  </View>
                  <Icon name="chevron-up" size={20} color={colors.textTertiary} />
                </Pressable>
              ) : null}
            </View>
          }
        >
          <View style={[styles.content, !ready && { paddingBottom: insets.bottom }]}>
            {status === 'loading' || status === 'idle' ? (
              <View style={styles.loading}>
                <LoadingView message="경로를 찾고 있어요" />
                <SkeletonBlock height={220} />
                <SkeletonBlock height={220} />
              </View>
            ) : null}

            {status === 'error' && error ? (
              error.code === 'SAME_LOCATION' ? (
                <StateView
                  tone="error"
                  icon="alert-circle"
                  title="출발지와 도착지가 같아요"
                  message="다른 도착지를 골라 주세요."
                  actions={[{ label: '도착지 바꾸기', onPress: goSearchDestination }]}
                />
              ) : (
                <StateView
                  tone="error"
                  icon="alert-circle"
                  title="경로를 불러오지 못했어요"
                  message={error.retryable ? '잠시 뒤에 다시 시도해 주세요. 목적지를 바꿔 볼 수도 있어요.' : error.message}
                  actions={[
                    ...(error.retryable ? [{ label: '다시 시도', onPress: () => void loadRoutes() }] : []),
                    { label: '목적지 바꾸기', variant: 'secondary' as const, onPress: goSearchDestination },
                  ]}
                />
              )
            ) : null}

            {status === 'empty' ? (
              <StateView
                icon="route"
                title="갈 수 있는 경로를 찾지 못했어요"
                message="통행이 제한된 구간만 남아서 후보가 모두 제외됐어요. 개인 설정을 바꿔도 해결되지 않는 제한이라, 설정을 완화해서 보여드리지는 않아요."
                actions={[
                  { label: '목적지 바꾸기', onPress: goSearchDestination },
                  { label: '다시 조회', variant: 'secondary', onPress: () => void loadRoutes() },
                ]}
              />
            ) : null}

            {ready ? (
              <View style={styles.cards} accessibilityRole="radiogroup">
                {recommendation.notices
                  .filter((n) => n.kind === 'over_limit')
                  .map((notice) => (
                    <Notice
                      key={notice.kind}
                      tone={NOTICE_TONE[notice.kind]}
                      text={notice.text}
                      actionLabel="허용 추가 시간 바꾸기"
                      onAction={() => navigation.navigate('Preferences')}
                    />
                  ))}
                {items.map(({ item, route }) => (
                  <RouteCard
                    key={route.id}
                    testID={`card-${route.label}`}
                    route={route}
                    ranked={item}
                    selected={route.id === selectedRouteId}
                    onPress={() => selectRoute(route.id)}
                  />
                ))}
                {recommendation.notices
                  .filter((n) => n.kind !== 'over_limit')
                  .map((notice) => (
                    <Notice key={notice.kind} tone={NOTICE_TONE[notice.kind]} text={notice.text} />
                  ))}
                <Text variant="caption" color={colors.textTertiary} align="center">
                  예상 시간은 교통 상황에 따라 달라질 수 있어요.
                </Text>
              </View>
            ) : null}
          </View>
        </BottomSheet>

        <View style={[styles.overlay, { paddingTop: insets.top + space.sm }]} onLayout={(e) => setOverlayHeight(e.nativeEvent.layout.height)}>
          <IconButton icon="back" label="뒤로 가기" variant="floating" onPress={() => navigation.goBack()} testID="compare-back" />
          <View style={[styles.trip, shadow.floating]}>
            <Pressable
              accessibilityRole="button"
              accessibilityHint="누르면 출발지를 바꿔요"
              onPress={() => navigation.navigate('Search', { mode: 'origin' })}
              hitSlop={{ top: 2, bottom: 2 }}
              style={styles.tripRow}
            >
              <View style={styles.tripDot} />
              <Text variant="captionStrong" color={colors.textTertiary} style={styles.tripLabel} numberOfLines={1}>
                출발
              </Text>
              <Text variant="bodyStrong" numberOfLines={2} style={styles.tripName}>
                {placeLabel(origin.name)}
              </Text>
            </Pressable>
            <View style={styles.tripDivider} />
            <Pressable
              accessibilityRole="button"
              accessibilityHint="누르면 도착지를 바꿔요"
              onPress={goSearchDestination}
              hitSlop={{ top: 2, bottom: 2 }}
              style={styles.tripRow}
            >
              <Icon name="pin" size={14} color={colors.text} strokeWidth={2.6} />
              <Text variant="captionStrong" color={colors.textTertiary} style={styles.tripLabel} numberOfLines={1}>
                도착
              </Text>
              <Text variant="bodyStrong" numberOfLines={2} style={styles.tripName}>
                {destination?.name ?? ''}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {ready && selected ? (
        <ActionBar>
          {recommended && recommended.route.id !== selected.route.id ? (
            <View style={styles.differs}>
              <Text variant="caption" color={colors.textSecondary} style={styles.differsText}>
                맞춤 추천은 {recommended.route.label} 경로예요. 지금은 {selected.route.label} 경로를 골랐어요.
              </Text>
              <Button title="추천 경로로 바꾸기" variant="tertiary" size="small" fullWidth={false} onPress={() => selectRoute(recommended.route.id)} />
            </View>
          ) : null}
          <View style={[styles.buttons, stacked && styles.buttonsStacked]}>
            <Button
              testID="compare-detail"
              title="자세히"
              accessibilityLabel="자세히 보기"
              variant="neutral"
              style={stacked ? styles.btnStacked : styles.btnDetail}
              onPress={openDetail}
              accessibilityHint="선택한 경로의 이유와 구간을 자세히 봐요"
            />
            <Button
              testID="compare-start"
              title={`${selected.route.label} 경로로 안내 시작`}
              icon="navigation"
              style={stacked ? styles.btnStacked : styles.btnStart}
              onPress={startGuidance}
            />
          </View>
        </ActionBar>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  area: { flex: 1, overflow: 'hidden' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    paddingHorizontal: layout.screenX - 8,
    paddingBottom: space.xs,
    pointerEvents: 'box-none',
  },
  trip: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.card, paddingHorizontal: space.lg },
  tripRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 46, paddingVertical: 2 },
  tripDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 3, borderColor: colors.text, backgroundColor: colors.surface },
  tripLabel: { flexShrink: 0 },
  tripName: { flex: 1 },
  tripDivider: { height: 1, backgroundColor: colors.border, marginLeft: space.xl },
  sheetHeader: { paddingHorizontal: layout.screenX, paddingBottom: space.sm, gap: space.xs },
  // 큰 글자에서는 버튼이 다음 줄로 내려가도록 줄바꿈을 허용하고, 제목은 글자 단위로 쪼개지지 않게 지킨다
  sheetTitleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.sm },
  sheetTitle: { flexGrow: 1, flexShrink: 0 },
  peekSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    height: PEEK_SUMMARY_HEIGHT,
  },
  peekText: { flex: 1, gap: 2 },
  content: { paddingHorizontal: layout.screenX, paddingTop: space.xs },
  loading: { gap: space.md },
  cards: { gap: space.md },
  differs: { flexDirection: 'row', alignItems: 'center', gap: space.sm, justifyContent: 'space-between' },
  differsText: { flex: 1 },
  buttons: { flexDirection: 'row', gap: space.sm },
  // column-reverse 로 두면 마지막 버튼(안내 시작)이 위에 온다
  buttonsStacked: { flexDirection: 'column-reverse' },
  btnStacked: { alignSelf: 'stretch' },
  btnDetail: { flex: 3 },
  btnStart: { flex: 8 },
});
