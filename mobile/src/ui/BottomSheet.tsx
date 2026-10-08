import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Animated, Easing, PanResponder, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { colors, radius, shadow, space } from '../design/tokens';
import { useReducedMotion } from '../hooks/useReducedMotion';

export interface BottomSheetProps {
  /** 각 단계에서 보이는 높이(px). 오름차순 (예: 요약, 비교, 확장) */
  snapHeights: number[];
  index: number;
  onIndexChange: (index: number) => void;
  /** 손잡이 아래의 고정 영역. 요약 단계에서도 이 영역은 보인다. */
  header: ReactNode;
  /** 스크롤되는 본문 */
  children: ReactNode;
  /** 손잡이 접근성 라벨 */
  handleLabel?: string;
  testID?: string;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
/** 이보다 적게 움직인 손잡이 터치는 끌기가 아니라 "누르기"로 본다 */
const TAP_SLOP = 5;

/**
 * 드래그로도, 손잡이 탭으로도 높이를 바꿀 수 있는 바텀시트.
 * 부모는 position 이 있는 영역이어야 하며 overflow 를 숨겨야 한다. 시트는 부모의 아래쪽에 붙는다.
 * 요약 단계에서는 본문을 스크린리더 대상에서 빼고, 헤더의 버튼으로 펼치게 한다.
 *
 * 끌기 제스처
 * - 손잡이는 터치 시작 시점에 제스처를 바로 가져간다. (웹에서는 포인터가 시트 밖으로 나가면 이동 중 협상이 끊기기 때문)
 * - 헤더의 나머지 영역은 위아래로 움직이기 시작하면 가져간다 (헤더 안의 버튼 탭은 그대로 동작한다).
 * - 한 번 가져간 제스처는 지도 등 다른 영역이 빼앗지 못한다.
 */
export function BottomSheet({ snapHeights, index, onIndexChange, header, children, handleLabel, testID }: BottomSheetProps) {
  const reducedMotion = useReducedMotion();
  const maxHeight = snapHeights[snapHeights.length - 1] ?? 0;
  const translateFor = (i: number) => maxHeight - (snapHeights[i] ?? snapHeights[0] ?? 0);

  const y = useRef(new Animated.Value(translateFor(index))).current;
  const startY = useRef(0);
  const currentY = useRef(translateFor(index));
  const latest = useRef({ snapHeights, index, onIndexChange, maxHeight, reducedMotion });
  latest.current = { snapHeights, index, onIndexChange, maxHeight, reducedMotion };

  useEffect(() => {
    const id = y.addListener(({ value }) => {
      currentY.current = value;
    });
    return () => y.removeListener(id);
  }, [y]);

  const animateTo = (toValue: number) => {
    if (latest.current.reducedMotion) {
      y.setValue(toValue);
      return;
    }
    Animated.timing(y, {
      toValue,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  };

  // 부모가 단계를 바꾸거나 높이 목록이 달라지면 해당 위치로 이동한다
  const snapKey = snapHeights.join(',');
  useEffect(() => {
    animateTo(translateFor(index));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, snapKey]);

  const nextIndex = () => {
    const { index: current, snapHeights: heights } = latest.current;
    return current >= heights.length - 1 ? 0 : current + 1;
  };

  const createPan = (claimOnStart: boolean) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => claimOnStart,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        y.stopAnimation((v) => {
          startY.current = v;
        });
      },
      onPanResponderMove: (_, g) => {
        const { snapHeights: heights, maxHeight: max } = latest.current;
        const lowest = max - (heights[0] ?? 0);
        y.setValue(clamp(startY.current + g.dy, 0, lowest));
      },
      onPanResponderRelease: (_, g) => {
        const { snapHeights: heights, maxHeight: max, index: current, onIndexChange: change } = latest.current;
        if (claimOnStart && Math.abs(g.dx) < TAP_SLOP && Math.abs(g.dy) < TAP_SLOP) {
          change(nextIndex());
          return;
        }
        const projected = currentY.current + g.vy * 120;
        let best = 0;
        let bestDistance = Infinity;
        heights.forEach((h, i) => {
          const distance = Math.abs(max - h - projected);
          if (distance < bestDistance) {
            best = i;
            bestDistance = distance;
          }
        });
        if (best !== current) change(best);
        else animateTo(max - (heights[best] ?? 0));
      },
      onPanResponderTerminate: () => {
        const { snapHeights: heights, maxHeight: max, index: current } = latest.current;
        animateTo(max - (heights[current] ?? 0));
      },
    });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const headerPan = useMemo(() => createPan(false), [y]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handlePan = useMemo(() => createPan(true), [y]);

  const collapsed = index === 0;
  const hiddenSpace = maxHeight - (snapHeights[index] ?? 0);
  const label = handleLabel ?? (collapsed ? '목록 펼치기' : index >= snapHeights.length - 1 ? '목록 줄이기' : '목록 더 펼치기');

  return (
    <Animated.View testID={testID} style={[styles.sheet, shadow.sheet, { height: maxHeight, transform: [{ translateY: y }] }]}>
      <View {...headerPan.panHandlers} style={styles.dragArea}>
        <View
          {...handlePan.panHandlers}
          accessible
          accessibilityRole="button"
          accessibilityLabel={label}
          onAccessibilityTap={() => onIndexChange(nextIndex())}
          hitSlop={{ top: 8, bottom: 8, left: 40, right: 40 }}
          style={styles.handleHit}
          testID="sheet-handle"
        >
          <View style={styles.handle} />
        </View>
        {header}
      </View>
      <View style={styles.body} aria-hidden={collapsed}>
        <ScrollView
          scrollEnabled={!collapsed}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: hiddenSpace + space.xl }}
        >
          {children}
        </ScrollView>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
  },
  dragArea: { backgroundColor: colors.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet },
  handleHit: { alignItems: 'center', justifyContent: 'center', height: 24 },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong },
  body: { flex: 1 },
});
