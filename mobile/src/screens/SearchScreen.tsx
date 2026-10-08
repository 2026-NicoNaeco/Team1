import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatDistance } from '../domain/format';
import { haversineM } from '../domain/geo';
import type { Place } from '../domain/types';
import { colors, layout, radius, space } from '../design/tokens';
import type { RootScreenProps } from '../navigation/types';
import { getServices } from '../services';
import { useAppStore } from '../state/appStore';
import { useTripStore } from '../state/tripStore';
import { CATEGORY_LABEL } from '../mock/places';
import { DemoBadge } from '../ui/Badges';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { SearchInput } from '../ui/SearchField';
import { SkeletonBlock, StateView } from '../ui/StateViews';
import { Text } from '../ui/Text';

type SearchStatus = 'idle' | 'loading' | 'done' | 'error';

const DEBOUNCE_MS = 250;

/**
 * 장소 검색. 키보드가 열린 상태를 기준으로 결과 목록을 보여주고, 결과가 없으면 입력 수정이나 샘플 장소 선택으로 이어준다.
 * 샘플 장소 안에서만 찾으며 없는 장소를 만들어 내지 않는다.
 */
export function SearchScreen({ navigation, route }: RootScreenProps<'Search'>) {
  const mode = route.params.mode;
  const insets = useSafeAreaInsets();
  const origin = useTripStore((s) => s.origin);
  const destination = useTripStore((s) => s.destination);
  const setOrigin = useTripStore((s) => s.setOrigin);
  const setDestination = useTripStore((s) => s.setDestination);
  const recents = useAppStore((s) => s.recents);

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [results, setResults] = useState<Place[]>([]);
  const [samples, setSamples] = useState<Place[]>([]);
  const [attempt, setAttempt] = useState(0);
  const controller = useRef<AbortController | null>(null);

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

  // 입력이 멈추면 검색한다. 이전 요청은 취소하고 오래된 응답은 무시한다.
  useEffect(() => {
    controller.current?.abort();
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setStatus('idle');
      setResults([]);
      return;
    }
    setStatus('loading');
    const ctrl = new AbortController();
    controller.current = ctrl;
    const timer = setTimeout(() => {
      getServices()
        .places.search(trimmed, { signal: ctrl.signal })
        .then((list) => {
          if (ctrl.signal.aborted) return;
          setResults(list);
          setStatus('done');
        })
        .catch((e: unknown) => {
          if (ctrl.signal.aborted || (e as { name?: string })?.name === 'AbortError') return;
          setStatus('error');
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, attempt]);

  const blockedId = mode === 'destination' ? origin.id : destination?.id;

  const choose = useCallback(
    (place: Place) => {
      if (place.id === blockedId) return;
      if (mode === 'destination') {
        setDestination(place);
        navigation.navigate('RouteCompare');
      } else {
        setOrigin(place);
        navigation.goBack();
      }
    },
    [blockedId, mode, navigation, setDestination, setOrigin],
  );

  const suggestions = useMemo(() => {
    const seen = new Set<string>();
    const list = mode === 'destination' ? [...recents, ...samples] : samples;
    return list.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }, [mode, recents, samples]);

  const renderRow = (place: Place) => {
    const blocked = place.id === blockedId;
    const distance = formatDistance(haversineM(origin.location, place.location));
    return (
      <Pressable
        key={place.id}
        testID={`result-${place.id}`}
        accessibilityRole="button"
        aria-disabled={blocked}
        accessibilityHint={blocked ? undefined : mode === 'destination' ? '누르면 이 장소로 가는 경로를 비교해요' : '누르면 출발지로 정해요'}
        disabled={blocked}
        onPress={() => choose(place)}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed, blocked && styles.rowBlocked]}
      >
        <View style={styles.rowIcon}>
          <Icon name="pin" size={20} color={blocked ? colors.textDisabled : colors.primary} />
        </View>
        <View style={styles.rowText}>
          <Text variant="bodyStrong" numberOfLines={2} color={blocked ? colors.textDisabled : colors.text}>
            {place.name}
          </Text>
          <Text variant="caption" color={colors.textSecondary} numberOfLines={2}>
            {place.address}
          </Text>
          <Text variant="caption" color={colors.textSecondary}>
            {blocked ? (mode === 'destination' ? '출발지와 같은 장소예요' : '도착지와 같은 장소예요') : `${CATEGORY_LABEL[place.category]} · 출발지에서 ${distance}`}
          </Text>
        </View>
      </Pressable>
    );
  };

  const trimmed = query.trim();
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <IconButton icon="back" label="뒤로 가기" onPress={() => navigation.goBack()} />
        <SearchInput
          testID="search-input"
          value={query}
          onChangeText={setQuery}
          placeholder={mode === 'destination' ? '목적지를 검색해 보세요' : '출발지를 검색해 보세요'}
          autoFocus
        />
      </View>
      <View style={styles.context}>
        <Text variant="captionStrong" color={colors.primary}>
          {mode === 'destination' ? '도착지 검색' : '출발지 검색'}
        </Text>
        <DemoBadge label="샘플 장소만 검색돼요" />
      </View>

      <FlatList
        data={[0]}
        keyExtractor={() => 'body'}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + space.xl }]}
        renderItem={() => (
          <View>
            {trimmed.length === 0 ? (
              <>
                <Text variant="captionStrong" color={colors.textSecondary} style={styles.sectionTitle}>
                  {mode === 'destination' && recents.length > 0 ? '최근 목적지와 샘플 장소' : '샘플 장소'}
                </Text>
                {suggestions.map(renderRow)}
              </>
            ) : status === 'loading' ? (
              <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel="장소를 찾고 있어요">
                <Text variant="caption" color={colors.textSecondary}>
                  샘플 장소에서 찾고 있어요
                </Text>
                <SkeletonBlock height={72} />
                <SkeletonBlock height={72} />
              </View>
            ) : status === 'error' ? (
              <StateView
                tone="error"
                icon="alert-circle"
                title="검색하지 못했어요"
                message="잠시 뒤에 다시 시도해 주세요."
                actions={[{ label: '다시 검색', onPress: () => setAttempt((n) => n + 1) }]}
              />
            ) : results.length === 0 ? (
              <>
                <StateView
                  icon="search"
                  title="검색 결과가 없어요"
                  message={`'${trimmed}'와 일치하는 데모 장소가 없어요. 철자를 확인하거나 아래 샘플 장소를 골라 보세요.`}
                  actions={[{ label: '검색어 지우기', variant: 'secondary', onPress: () => setQuery('') }]}
                />
                <Text variant="captionStrong" color={colors.textSecondary} style={styles.sectionTitle}>
                  샘플 장소
                </Text>
                {suggestions.map(renderRow)}
              </>
            ) : (
              <>
                <Text variant="captionStrong" color={colors.textSecondary} style={styles.sectionTitle}>
                  검색 결과 {results.length}개
                </Text>
                {results.map(renderRow)}
              </>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: layout.screenX - 8, paddingTop: space.sm },
  context: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingHorizontal: layout.screenX,
    paddingVertical: space.md,
  },
  listContent: { paddingHorizontal: layout.screenX },
  sectionTitle: { marginTop: space.md, marginBottom: space.sm },
  loading: { gap: space.sm, paddingTop: space.md },
  row: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.md,
    marginBottom: space.sm,
    minHeight: 72,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowPressed: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  rowBlocked: { backgroundColor: colors.surfaceMuted },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.control,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: 2 },
});
