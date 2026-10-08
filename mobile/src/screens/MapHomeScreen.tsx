import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Place } from '../domain/types';
import { colors, layout, radius, shadow, space } from '../design/tokens';
import { MapView, type CameraRequest, type MapMarker } from '../map';
import type { TabScreenProps } from '../navigation/types';
import { getServices } from '../services';
import { useAppStore } from '../state/appStore';
import { useTripStore } from '../state/tripStore';
import { DemoBadge } from '../ui/Badges';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Notice } from '../ui/Notice';
import { SearchButton } from '../ui/SearchField';
import { Text } from '../ui/Text';

/**
 * 지도 홈: 지도 + 눈에 띄는 검색창. 환영 문구나 통계가 검색과 지도를 밀어내지 않는다.
 * 기록이 없어도 아래 패널의 샘플 장소로 바로 다음 행동을 할 수 있다.
 */
export function MapHomeScreen({ navigation }: TabScreenProps<'Map'>) {
  const insets = useSafeAreaInsets();
  const origin = useTripStore((s) => s.origin);
  const destination = useTripStore((s) => s.destination);
  const setDestination = useTripStore((s) => s.setDestination);
  const recents = useAppStore((s) => s.recents);
  const persistenceError = useAppStore((s) => s.persistence.status === 'error');
  const retryPersist = useAppStore((s) => s.retryPersist);
  const discarded = useAppStore((s) => s.discardedOnLoad);

  const [samples, setSamples] = useState<Place[]>([]);
  const [topHeight, setTopHeight] = useState(0);
  const [bottomHeight, setBottomHeight] = useState(0);

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

  return (
    <View style={styles.root}>
      <MapView
        routes={[]}
        markers={markers}
        camera={camera}
        insets={{ top: topHeight + space.sm, bottom: bottomHeight + space.sm, left: 0, right: 0 }}
        accessibilityLabel={`데모 지도. 출발지는 ${origin.name}${destination ? `, 목적지는 ${destination.name}` : ''}입니다. 실제 도로가 아닌 가상의 지역입니다.`}
        testID="home-map"
      />

      <View
        style={[styles.top, { paddingTop: insets.top + space.sm }]}
        onLayout={(e) => setTopHeight(e.nativeEvent.layout.height)}
      >
        <SearchButton
          testID="home-search"
          placeholder="어디로 갈까요?"
          value={destination?.name}
          onPress={() => navigation.navigate('Search', { mode: 'destination' })}
        />
        <Pressable
          testID="home-origin"
          accessibilityRole="button"
          accessibilityHint="누르면 출발지를 바꿔요"
          onPress={() => navigation.navigate('Search', { mode: 'origin' })}
          style={({ pressed }) => [styles.origin, shadow.floating, pressed && styles.originPressed]}
        >
          <Text variant="captionStrong" color={colors.textSecondary}>
            출발
          </Text>
          <Text variant="captionStrong" style={styles.originName} numberOfLines={2}>
            {origin.name}
          </Text>
          <Icon name="chevron-down" size={18} color={colors.textSecondary} />
        </Pressable>
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
        <View style={[styles.panel, shadow.sheet]} onLayout={(e) => setBottomHeight(e.nativeEvent.layout.height)}>
          {destination ? (
            <>
              <Text variant="captionStrong" color={colors.textSecondary}>
                이어서 보기
              </Text>
              <Text variant="heading" numberOfLines={2}>
                {destination.name}
              </Text>
              <Text variant="caption" color={colors.textSecondary} numberOfLines={2}>
                {destination.address}
              </Text>
              <Button title="경로 비교 보기" icon="route" onPress={() => navigation.navigate('RouteCompare')} testID="home-continue" />
              <Button
                title="다른 목적지 찾기"
                variant="tertiary"
                onPress={() => navigation.navigate('Search', { mode: 'destination' })}
              />
            </>
          ) : (
            <>
              <View style={styles.panelTitleRow}>
                <Text variant="heading" style={styles.panelTitle}>
                  {recents.length > 0 ? '최근·샘플 장소' : '샘플 장소로 시작해 보세요'}
                </Text>
                <DemoBadge label="데모 장소" />
              </View>
              <Text variant="caption" color={colors.textSecondary}>
                목적지를 검색하거나 아래 장소를 골라 경로를 비교해 보세요. 데모에서는 샘플 장소만 찾을 수 있어요.
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {quickPlaces.map((place) => (
                  <Pressable
                    key={place.id}
                    testID={`place-${place.id}`}
                    accessibilityRole="button"
                    accessibilityHint="누르면 이 장소로 가는 경로를 비교해요"
                    onPress={() => choose(place)}
                    style={({ pressed }) => [styles.placeChip, pressed && styles.placeChipPressed]}
                  >
                    <Icon name="pin" size={16} color={colors.primary} />
                    <Text variant="captionStrong" numberOfLines={1} style={styles.placeChipText}>
                      {place.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}
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
  origin: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: layout.minTouch,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
  },
  originPressed: { backgroundColor: colors.surfaceMuted },
  originName: { flexShrink: 1 },
  bottomWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, pointerEvents: 'box-none' },
  panel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: layout.screenX,
    paddingTop: space.lg + 4,
    paddingBottom: space.lg,
    gap: space.sm,
  },
  panelTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  panelTitle: { flex: 1 },
  chips: { gap: space.sm, paddingVertical: space.xs, paddingRight: layout.screenX },
  placeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    maxWidth: 230,
    minHeight: layout.minTouch,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.control,
    backgroundColor: colors.primarySoft,
    borderWidth: 1.5,
    borderColor: colors.primarySoft,
  },
  placeChipPressed: { borderColor: colors.primary },
  placeChipText: { flexShrink: 1 },
});
