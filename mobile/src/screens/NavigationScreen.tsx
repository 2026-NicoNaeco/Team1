import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, BackHandler, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatKm, formatMinutes, formatNavDistance, minutesFromSeconds } from '../domain/format';
import type { GuidanceStep } from '../domain/types';
import { colors, layout, radius, shadow, space } from '../design/tokens';
import { MapView, type MapMarker, type MapRoute } from '../map';
import type { RootScreenProps } from '../navigation/types';
import { getServices } from '../services';
import type { NavigationSimulator, SimulationSnapshot } from '../services/types';
import { useTripStore } from '../state/tripStore';
import { useUiStore } from '../state/uiStore';
import { Button } from '../ui/Button';
import { Icon, type IconName } from '../ui/Icon';
import { MANEUVER_LABEL, ManeuverIcon } from '../ui/ManeuverIcon';
import { Screen, ScreenHeader } from '../ui/Screen';
import { StateView } from '../ui/StateViews';
import { Text, type TextProps } from '../ui/Text';

/** 따라가는 지도의 확대율(px/m). 다음 회전이 너무 멀지 않은 한 앞쪽 길이 보이도록 넉넉히 둔다 */
const FOLLOW_SCALE = 0.2;
/**
 * 주행 화면의 글자 배율 상한. 위(안내 카드)와 아래(진행 바)가 화면 높이를 나눠 쓰므로,
 * 핵심인 다음 안내 거리(navDistance 자체 상한 사용)를 제외한 글자는 1.4배까지만 키운다.
 */
const NAV_MAX_SCALE = 1.4;
/** 안내 카드의 바탕: 평소에는 브랜드색, 일시정지 중에는 차분한 회색 */
const BANNER_ACTIVE = colors.primary;
const BANNER_PAUSED = '#4E5968';

function NavText(props: TextProps) {
  return <Text maxFontSizeMultiplier={NAV_MAX_SCALE} {...props} />;
}

/** 지금 구간에서 알아 두면 좋은 점 (최대 2개). 주행 중에는 짧은 문구만 보여준다. */
function hintsFor(current: GuidanceStep, next: GuidanceStep | null, distanceToNextM: number): Array<{ icon: IconName; text: string }> {
  const out: Array<{ icon: IconName; text: string }> = [];
  if (next?.factors.UNPROTECTED_LEFT) out.push({ icon: 'turn-left', text: '비보호 좌회전 구간이에요' });
  if ((current.factors.LANE_CHANGE ?? 0) > 0 && distanceToNextM < 1500) {
    out.push({ icon: 'lane-change', text: '미리 차로를 옮겨 두세요 (예상)' });
  }
  if ((current.factors.PROTECTED_ZONE ?? 0) > 0) out.push({ icon: 'zone', text: '보호구역을 지나고 있어요' });
  return out.slice(0, 2);
}

/**
 * 주행 안내. 선택한 경로 위를 따라 움직이며 실제 위치(GPS)는 쓰지 않는다.
 * 이 화면에는 설정, 텍스트 입력, 평가 요청, 불필요한 팝업을 두지 않는다. 피드백은 도착(또는 종료) 뒤에만 받는다.
 * 처음 안내를 시작할 때 한 번만 시연 안내를 보여주고, 안내 중에는 작은 표시로 계속 알린다.
 */
export function NavigationScreen({ navigation, route: navRoute }: RootScreenProps<'Navigation'>) {
  const { routeId, fromProgressM } = navRoute.params;
  const insets = useSafeAreaInsets();
  const candidate = useTripStore((s) => s.candidates.find((c) => c.id === routeId));
  const recommendation = useTripStore((s) => s.recommendation);
  const origin = useTripStore((s) => s.origin);
  const destination = useTripStore((s) => s.destination);
  const setLastRun = useTripStore((s) => s.setLastRun);
  const noticeAcknowledged = useUiStore((s) => s.demoNoticeAcknowledged);
  const acknowledgeNotice = useUiStore((s) => s.acknowledgeDemoNotice);

  const [snap, setSnap] = useState<SimulationSnapshot | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [topHeight, setTopHeight] = useState(0);
  const [bottomHeight, setBottomHeight] = useState(0);
  const simulator = useRef<NavigationSimulator | null>(null);
  const finished = useRef(false);

  useEffect(() => {
    if (!candidate) return;
    const sim = getServices().createSimulator();
    simulator.current = sim;
    const unsubscribe = sim.subscribe(setSnap);
    sim.start(candidate, { fromProgressM });
    // 시연 안내를 확인하기 전에는 출발선에서 기다린다
    if (!useUiStore.getState().demoNoticeAcknowledged) sim.pause();
    return () => {
      unsubscribe();
      sim.dispose();
      simulator.current = null;
    };
    // 같은 경로에서 다시 시작하는 경우는 화면을 새로 열어서 처리한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate?.id]);

  // 앱이 백그라운드로 가면 자동으로 일시정지한다
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') simulator.current?.pause();
    });
    return () => sub.remove();
  }, []);

  // 안드로이드 뒤로 가기: 바로 나가지 않고 종료 여부를 먼저 묻는다 (시연 안내 중에는 그냥 나간다)
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (!useUiStore.getState().demoNoticeAcknowledged) return false;
        simulator.current?.pause();
        setConfirmEnd(true);
        return true;
      });
      return () => sub.remove();
    }, []),
  );

  useEffect(() => {
    if (!snap || !candidate || finished.current) return;
    if (snap.status !== 'arrived' && snap.status !== 'stopped') return;
    const ranked = recommendation?.items.find((i) => i.routeId === candidate.id);
    finished.current = true;
    if (!ranked || !destination) {
      navigation.goBack();
      return;
    }
    setLastRun({
      route: candidate,
      ranked,
      recommendedRouteId: recommendation?.recommendedRouteId ?? null,
      origin,
      destination,
      outcome: snap.status === 'arrived' ? 'arrived' : 'stopped',
      progress: snap.fraction,
      progressM: snap.progressM,
    });
    navigation.replace('Arrival');
  }, [snap, candidate, recommendation, origin, destination, setLastRun, navigation]);

  const mapRoutes = useMemo<MapRoute[]>(
    () =>
      candidate
        ? [{ id: candidate.id, label: candidate.label, path: candidate.path, selected: true, traveledM: snap?.progressM ?? 0 }]
        : [],
    [candidate, snap?.progressM],
  );
  const markers = useMemo<MapMarker[]>(() => {
    const list: MapMarker[] = [];
    if (destination) list.push({ id: 'destination', kind: 'destination', point: destination.location, label: '도착' });
    if (snap) list.push({ id: 'vehicle', kind: 'vehicle', point: snap.position, headingDeg: snap.headingDeg });
    return list;
  }, [destination, snap]);

  if (!candidate) {
    return (
      <Screen>
        <ScreenHeader title="주행 안내" onBack={() => navigation.goBack()} />
        <StateView
          icon="route"
          title="경로 정보를 찾을 수 없어요"
          message="설정이나 목적지가 바뀌어 이전 경로가 사라졌어요."
          actions={[{ label: '돌아가기', onPress: () => navigation.goBack() }]}
        />
      </Screen>
    );
  }

  const holding = !noticeAcknowledged;
  const paused = snap?.status === 'paused' && !holding;
  const next = snap?.nextStep ?? null;
  const hints = snap && next ? hintsFor(snap.currentStep, next, snap.distanceToNextM) : [];
  const then = snap?.thenStep ?? null;
  const arrivingSoon = next?.maneuver === 'ARRIVE';

  const confirmNotice = () => {
    acknowledgeNotice();
    simulator.current?.resume();
  };

  return (
    <View style={styles.root}>
      <MapView
        routes={mapRoutes}
        markers={markers}
        camera={
          snap
            ? { type: 'follow', key: 'follow', point: snap.position, scale: FOLLOW_SCALE }
            : { type: 'fit', key: 'nav-start', points: candidate.path }
        }
        insets={{ top: topHeight + space.sm, bottom: bottomHeight + space.sm, left: 0, right: 0 }}
        interactive={false}
        accessibilityLabel="주행 안내 지도. 선택한 경로 위를 따라 이동하는 위치가 표시돼요."
        testID="nav-map"
      />

      <View style={styles.top} onLayout={(e) => setTopHeight(e.nativeEvent.layout.height)}>
        <View style={[styles.statusRow, { paddingTop: insets.top + space.sm }]}>
          <View style={styles.demoPill} accessible accessibilityLabel="시연 중. 실제 도로 안내가 아니에요.">
            <View style={styles.demoDot} />
            <NavText variant="micro" color={colors.textSecondary}>
              시연 중 · 실제 도로 안내가 아니에요
            </NavText>
          </View>
        </View>

        <View style={[styles.banner, { backgroundColor: paused ? BANNER_PAUSED : BANNER_ACTIVE }, shadow.floating]} testID="nav-card">
          {next ? (
            <>
              <View style={styles.bannerMain}>
                <View style={styles.iconBox} aria-hidden>
                  <ManeuverIcon maneuver={next.maneuver} size={52} color={colors.onPrimary} strokeWidth={5.5} />
                </View>
                <View style={styles.bannerText}>
                  <NavText variant="navDistance" color={colors.onPrimary} accessibilityLiveRegion="polite" testID="nav-distance">
                    {arrivingSoon && (snap?.distanceToNextM ?? 0) < 20 ? '도착' : formatNavDistance(snap?.distanceToNextM ?? 0)}
                  </NavText>
                  <NavText variant="lead" color={colors.onPrimary} numberOfLines={2} testID="nav-instruction">
                    {next.instruction}
                  </NavText>
                </View>
              </View>
              {hints.length > 0 ? (
                <View style={styles.hints}>
                  {hints.map((h) => (
                    <View key={h.text} style={styles.hint}>
                      <Icon name={h.icon} size={16} color={colors.primaryStrong} />
                      <NavText variant="captionStrong" color={colors.primaryStrong} style={styles.hintText}>
                        {h.text}
                      </NavText>
                    </View>
                  ))}
                </View>
              ) : null}
              {then ? (
                <View style={styles.then}>
                  <NavText variant="caption" color={colors.onPrimary}>
                    그다음
                  </NavText>
                  <ManeuverIcon maneuver={then.maneuver} size={20} color={colors.onPrimary} strokeWidth={6} />
                  <NavText variant="captionStrong" color={colors.onPrimary} style={styles.thenText} numberOfLines={1}>
                    {MANEUVER_LABEL[then.maneuver]}
                    {then.maneuver !== 'ARRIVE' ? ` · ${then.roadName}` : ''}
                  </NavText>
                </View>
              ) : null}
              {paused ? (
                <View style={styles.pausedBadge}>
                  <Icon name="pause" size={14} color={colors.text} />
                  <NavText variant="captionStrong">일시정지됨</NavText>
                </View>
              ) : null}
            </>
          ) : (
            <NavText variant="lead" color={colors.onPrimary}>
              안내를 준비하고 있어요
            </NavText>
          )}
        </View>
      </View>

      <View
        testID="nav-bar"
        style={[styles.bottom, shadow.sheet, { paddingBottom: Math.max(insets.bottom, space.lg) }]}
        onLayout={(e) => setBottomHeight(e.nativeEvent.layout.height)}
      >
        {confirmEnd ? (
          <View style={styles.confirm}>
            <NavText variant="title2">안내를 끝낼까요?</NavText>
            <NavText variant="caption" color={colors.textSecondary}>
              지금까지 {Math.round((snap?.fraction ?? 0) * 100)}% 왔어요. 끝낸 뒤에도 평가를 남기거나 이어서 시작할 수 있어요.
            </NavText>
            <View style={styles.buttons}>
              <Button
                maxFontScale={NAV_MAX_SCALE}
                title="계속하기"
                variant="neutral"
                style={styles.btnGrow}
                onPress={() => {
                  setConfirmEnd(false);
                  simulator.current?.resume();
                }}
                testID="nav-continue"
              />
              <Button
                maxFontScale={NAV_MAX_SCALE}
                title="끝내기"
                variant="danger"
                style={styles.btnGrow}
                onPress={() => simulator.current?.stop()}
                testID="nav-end-confirm"
              />
            </View>
          </View>
        ) : (
          <>
            <View
              style={styles.track}
              accessibilityRole="progressbar"
              accessibilityLabel="경로 진행률"
              accessibilityValue={{ min: 0, max: 100, now: Math.round((snap?.fraction ?? 0) * 100) }}
            >
              <View style={[styles.fill, { width: `${Math.round((snap?.fraction ?? 0) * 100)}%` }]} />
            </View>
            <View style={styles.stats}>
              <View>
                <NavText variant="caption" color={colors.textSecondary}>
                  남은 시간
                </NavText>
                <NavText variant="title2" testID="nav-remaining-time">
                  {formatMinutes(minutesFromSeconds(snap?.remainingS ?? candidate.durationS))}
                </NavText>
              </View>
              <View>
                <NavText variant="caption" color={colors.textSecondary} align="right">
                  남은 거리
                </NavText>
                <NavText variant="title2" align="right">
                  {formatKm((snap?.remainingM ?? candidate.distanceM) / 1000)}
                </NavText>
              </View>
            </View>
            <View style={styles.buttons}>
              <Button
                maxFontScale={NAV_MAX_SCALE}
                testID="nav-toggle"
                title={paused ? '재개' : '일시정지'}
                icon={paused ? 'play' : 'pause'}
                variant={paused ? 'primary' : 'neutral'}
                style={styles.btnWide}
                onPress={() => (paused ? simulator.current?.resume() : simulator.current?.pause())}
              />
              <Button
                maxFontScale={NAV_MAX_SCALE}
                testID="nav-end"
                title="종료"
                variant="dangerSoft"
                style={styles.btnNarrow}
                onPress={() => {
                  simulator.current?.pause();
                  setConfirmEnd(true);
                }}
              />
            </View>
          </>
        )}
      </View>

      {holding ? (
        <View style={styles.scrim} testID="guidance-notice">
          <View style={[styles.noticeSheet, { paddingBottom: Math.max(insets.bottom, space.lg) + space.sm }]}>
            <View style={styles.noticeIcon}>
              <Icon name="info" size={26} color={colors.info} />
            </View>
            <View style={styles.noticeText}>
              <Text variant="title2" accessibilityRole="header">
                시연용 안내예요
              </Text>
              <Text variant="body" color={colors.textSecondary}>
                지금 보는 지도와 경로, 교통 정보는 시연용 데이터예요. 실제 도로에서 길을 찾는 데는 쓸 수 없어요. 안내는 선택한 경로를 따라 움직이는 화면이고, 위치 권한도 쓰지 않아요.
              </Text>
            </View>
            <Button testID="guidance-ack" title="확인했어요" onPress={confirmNotice} />
            <Button title="돌아가기" variant="tertiary" onPress={() => navigation.goBack()} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: { position: 'absolute', top: 0, left: 0, right: 0, pointerEvents: 'box-none' },
  statusRow: { paddingHorizontal: layout.screenX - 8, alignItems: 'flex-start', pointerEvents: 'none' },
  demoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: 5,
    borderRadius: radius.round,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
  },
  demoDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.caution },
  banner: {
    marginHorizontal: space.md,
    marginTop: space.sm,
    padding: space.lg,
    gap: space.md,
    borderRadius: radius.card + 4,
  },
  bannerMain: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  iconBox: {
    width: 76,
    height: 76,
    borderRadius: radius.card,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerText: { flex: 1, gap: 2 },
  hints: { gap: space.xs },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 1,
    borderRadius: radius.round,
    backgroundColor: colors.surface,
    alignSelf: 'flex-start',
  },
  hintText: { flexShrink: 1 },
  then: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.32)',
  },
  thenText: { flex: 1 },
  pausedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.round,
    backgroundColor: colors.surface,
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: layout.screenX,
    paddingTop: space.xl - 4,
    gap: space.lg,
  },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceStrong, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  stats: { flexDirection: 'row', justifyContent: 'space-between' },
  buttons: { flexDirection: 'row', gap: space.sm },
  btnWide: { flex: 2 },
  btnNarrow: { flex: 1 },
  btnGrow: { flex: 1 },
  confirm: { gap: space.md },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  noticeSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: layout.screenX,
    paddingTop: space.xl,
    gap: space.lg,
  },
  noticeIcon: { width: 52, height: 52, borderRadius: radius.round, backgroundColor: colors.infoBg, alignItems: 'center', justifyContent: 'center' },
  noticeText: { gap: space.sm },
});
