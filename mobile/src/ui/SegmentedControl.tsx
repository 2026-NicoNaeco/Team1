import { StyleSheet, View } from 'react-native';
import { colors, layout, radius, space } from '../design/tokens';
import { useFontScale } from '../hooks/useFontScale';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { haptics } from './haptics';

interface Option<T extends string> {
  value: T;
  label: string;
  testID?: string;
}

interface SegmentedControlProps<T extends string> {
  options: Array<Option<T>>;
  value: T;
  onChange: (value: T) => void;
  /** 스크린리더가 읽을 그룹 이름 */
  label: string;
}

/** 글자가 이 배율보다 커지면 칸이 좁아 글자가 쪼개지므로, 가로로 나란히 두는 대신 세로 목록으로 바꾼다 */
const STACK_FONT_SCALE = 1.3;

/**
 * 서로 배타적인 선택지를 한 줄에 나란히 보여주는 조절기. 선택된 칸은 흰 면이 떠오르고 글자가 굵어진다.
 * 큰 글자(시스템 배율 1.3 초과)에서는 칸마다 한 줄씩 세로로 쌓는다.
 */
export function SegmentedControl<T extends string>({ options, value, onChange, label }: SegmentedControlProps<T>) {
  const stacked = useFontScale() > STACK_FONT_SCALE;
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.track, stacked && styles.trackStacked]}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <PressableScale
            key={o.value}
            testID={o.testID}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            aria-checked={selected}
            onPress={() => {
              if (!selected) haptics.selection();
              onChange(o.value);
            }}
            pressedScale={0.96}
            style={stacked ? undefined : styles.segmentOuter}
            contentStyle={[styles.segment, stacked && styles.segmentStacked, selected && styles.segmentOn]}
          >
            <Text variant={selected ? 'captionStrong' : 'caption'} color={selected ? colors.text : colors.textSecondary} align="center">
              {o.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', backgroundColor: colors.surfaceStrong, borderRadius: radius.field, padding: 4, gap: 2 },
  trackStacked: { flexDirection: 'column' },
  segmentOuter: { flex: 1 },
  segment: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: space.xs, borderRadius: radius.control + 2 },
  segmentStacked: { minHeight: layout.minTouch, paddingHorizontal: space.md, paddingVertical: space.sm },
  segmentOn: { backgroundColor: colors.surface },
});
