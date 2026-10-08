import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FACTORS } from '../domain/factors';
import { formatDistance, placeLabel } from '../domain/format';
import { haversineM } from '../domain/geo';
import type { FactorCode, Place } from '../domain/types';
import { colors, layout, radius, shadow, space } from '../design/tokens';
import { useFontScale } from '../hooks/useFontScale';
import { MapView, type CameraRequest, type MapMarker } from '../map';
import { CATEGORY_LABEL } from '../mock/places';
import type { TabScreenProps } from '../navigation/types';
import { getServices } from '../services';
import { useAppStore } from '../state/appStore';
import { useTripStore } from '../state/tripStore';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { Notice } from '../ui/Notice';
import { PlaceRow } from '../ui/PlaceRow';
import { PressableScale } from '../ui/PressableScale';
import { SearchButton } from '../ui/SearchField';
import { Text } from '../ui/Text';

/** 내 운전 성향을 한 줄로 요약한다 (피하고 싶은 요소 + 허용 추가 시간) */
function preferenceSummary(priorities: Partial<Record<FactorCode, string>>, maxExtraMinutes: number): string {
  const avoid = (Object.entries(priorities) as Array<[FactorCode, string]>)
    .filter(([, level]) => level === 'avoid')
    .map(([code]) => FACTORS[code].label);
  const shown = avoid.slice(0, 2).join(' · ');
  const more = avoid.length > 2 ? ` 외 ${avoid.length - 2}개` : '';
  const head = avoid.length > 0 ? `${shown}${more} 피하기` : '피하고 싶은 걸 정하면 더 잘 맞아요';
  return `${head} · 최대 +${maxExtraMinutes}분`;
}

/**
 * 홈: 지도 위에 검색창을 띄우고, 아래 시트에서 내 운전 성향과 갈 만한 곳을 보여준다.
 * 환영 문구나 통계가 검색과 지도를 밀어내지 않는다. 기록이 없어도 바로 다음 행동을 할 수 있다.
 */
export function MapHomeScreen({ navigation }: TabScreenProps<'Map'>) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const fontScale = useFontScale();
  const origin = useTripStore((s) => s.origin);
  const destination = useTripStore((s) => s.destination);
  const setDestination = useTripStore((s) => s.setDestination);
  const profile = useAppStore((s) => s.profile);
  const recents = useAppStore((s) => s.recents);
  const persistenceError = useAppStore((s) => s.persistence.status === 'error');
  const retryPersist = useAppStore((s) => s.retryPersist);
  const discarded = useAppStore((s) => s.discardedOnLoad);

  const [samples, setSamples] = useState<Place[]>([]);
  const [topHeight, setTopHeight] = useState(0);
  const [bottomHeight, setBottomHeight] = useState(0);
  const [rootHeight, setRootHeight] = useState(0);

  useEffect(() => {
    let alive = true;
    getServices()
      .places.listSamples()
      .then((list) => alive && setSamples(list))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const markers = useMemo<MapMarker[]>(() => {
    const list: MapMarker[] = [{ id: 'origin', kind: 'origin', point: origin.location, label: '출발' }];
    if (destination) list.push({ id: 'destination', kind: 'destination', point: destination.location, label: '도착' });
    return list;
  }, [origin, destination]);

  const camera = useMemo<CameraRequest>(
    () =>
      destination
        ? { type: 'fit', key: `home:${origin.id}:${destination.id}`, points: [origin.location, destination.location] }
        : { type: 'overview', key: 'home' },
    [origin, destination],
  );

  const choose = (place: Place) => {
    if (place.id === origin.id) return;
    setDestination(place);
    navigation.navigate('RouteCompare');
  };

  const quickPlaces = useMemo(() => {
    const seen = new Set<string>();
    return [...recents, ...samples].filter((p) => {
      if (seen.has(p.id) || p.id === origin.id) return false;
      seen.add(p.id);
      return true;
    });
  }, [recents, samples, origin.id]);

  // 화면이 낮거나 글자가 크면 지도와 검색창을 가리지 않도록 보여주는 장소 수를 줄이고, 패널 높이에 상한을 둔다
  const rowCount = fontScale > 1.3 ? 1 : windowHeight < 700 ? 2 : 3;
  const panelMax = rootHeight > 0 ? Math.max(180, rootHeight - topHeight - space.lg) : undefined;

  return (
    <View style={styles.root} onLayout={(e) => setRootHeight(e.nativeEvent.layout.height)}>
      <MapView
        routes={[]}
        markers={markers}
        camera={camera}
        insets={{ top: topHeight + space.sm, bottom: bottomHeight + space.sm, left: 0, right: 0 }}
        accessibilityLabel={`지도. 출발지는 ${placeLabel(origin.name)}${destination ? `, 목적지는 ${destination.name}` : ''}입니다.`}
        testID="home-map"
      />

      <View style={[styles.top, { paddingTop: insets.top + space.sm }]} onLayout={(e) => setTopHeight(e.nativeEvent.layout.height)}>
        <SearchButton
          testID="home-search"
          placeholder="목적지를 검색해 보세요"
          value={destination?.name}
          onPress={() => navigation.navigate('Search', { mode: 'destination' })}
        />
        <PressableScale
          testID="home-origin"
          accessibilityRole="button"
          accessibilityHint="누르면 출발지를 바꿔요"
          onPress={() => navigation.navigate('Search', { mode: 'origin' })}
          pressedScale={0.97}
          style={styles.originOuter}
          contentStyle={({ pressed }) => [styles.origin, shadow.floating, pressed && styles.originPressed]}
        >
          <View style={styles.originDot} />
          <Text variant="captionStrong" color={colors.textSecondary}>
            출발
          </Text>
          <Text variant="captionStrong" style={styles.originName} numberOfLines={2}>
            {placeLabel(origin.name)}
          </Text>
          <Icon name="chevron-down" size={18} color={colors.textTertiary} />
        </PressableScale>
        {persistenceError ? (
          <Notice
            tone="error"
            title="저장하지 못했어요"
            text="변경한 설정이 이 기기에 저장되지 않았어요. 앱을 닫으면 사라질 수 있어요."
            actionLabel="다시 저장하기"
            onAction={() => void retryPersist()}
          />
        ) : null}
        {discarded.length > 0 ? (
          <Notice tone="unknown" title="일부 저장값을 읽지 못했어요" text={`${discarded.join(', ')}은(는) 기본값으로 다시 시작했어요.`} />
        ) : null}
      </View>

      <View style={styles.bottomWrap}>
        <View style={[styles.panel, shadow.sheet, panelMax ? { maxHeight: panelMax } : null]} onLayout={(e) => setBottomHeight(e.nativeEvent.layout.height)}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.panelContent}
          >
          {destination ? (
            <>
              <View style={styles.continueText}>
                <Text variant="captionStrong" color={colors.primaryStrong}>
                  이어서 볼까요?
                </Text>
                <Text variant="title2" numberOfLines={2}>
                  {destination.name}
                </Text>
                <Text variant="caption" color={colors.textSecondary} numberOfLines={2}>
                  {destination.address}
                </Text>
              </View>
              <Button title="경로 비교 보기" icon="route" onPress={() => navigation.navigate('RouteCompare')} testID="home-continue" />
              <Button title="다른 목적지 찾기" variant="tertiary" onPress={() => navigation.navigate('Search', { mode: 'destination' })} />
            </>
          ) : (
            <>
              <Card
                tone="tint"
                onPress={() => navigation.navigate('Preferences')}
                accessibilityHint="누르면 운전 성향을 바꿔요"
                testID="home-preferences"
                style={styles.prefCard}
              >
                <View style={styles.prefRow}>
                  <View style={styles.prefIcon}>
                    <Icon name="sliders" size={20} color={colors.onPrimary} />
                  </View>
                  <View style={styles.prefText}>
                    <Text variant="captionStrong" color={colors.primaryStrong}>
                      내 운전 성향
                    </Text>
                    <Text variant="bodyStrong" numberOfLines={2}>
                      {preferenceSummary(profile.priorities, profile.maxExtraMinutes)}
                    </Text>
                  </View>
                  <Icon name="chevron-right" size={20} color={colors.textTertiary} />
                </View>
              </Card>

              <Text variant="heading" accessibilityRole="header" style={styles.listTitle}>
                {recents.length > 0 ? '최근 목적지' : '이런 곳은 어때요?'}
              </Text>
              <View>
                {quickPlaces.slice(0, rowCount).map((place) => (
                  <PlaceRow
                    key={place.id}
                    testID={`place-${place.id}`}
                    variant="plain"
                    name={place.name}
                    subtitle={`${CATEGORY_LABEL[place.category]} · ${formatDistance(haversineM(origin.location, place.location))}`}
                    accessibilityHint="누르면 이 장소로 가는 경로를 비교해요"
                    onPress={() => choose(place)}
                  />
                ))}
              </View>
            </>
          )}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: layout.screenX,
    gap: space.sm,
    pointerEvents: 'box-none',
  },
  originOuter: { alignSelf: 'flex-start', maxWidth: '100%' },
  origin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: space.lg,
    paddingVertical: space.xs,
    borderRadius: radius.round,
    backgroundColor: colors.surface,
  },
  originPressed: { backgroundColor: colors.surfaceMuted },
  originDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 3, borderColor: colors.text, backgroundColor: colors.surface },
  originName: { flexShrink: 1 },
  bottomWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, pointerEvents: 'box-none' },
  panel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
  },
  panelContent: {
    paddingHorizontal: layout.screenX,
    paddingTop: space.xl,
    paddingBottom: space.lg,
    gap: space.sm,
  },
  continueText: { gap: space.xs, marginBottom: space.sm },
  prefCard: { marginBottom: space.xs },
  prefRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  prefIcon: { width: 40, height: 40, borderRadius: radius.round, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  prefText: { flex: 1, gap: 2 },
  listTitle: { marginTop: space.md, marginBottom: space.xs },
});
