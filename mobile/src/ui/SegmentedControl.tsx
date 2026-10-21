import { StyleSheet, View } from 'react-native';
import { colors, radius, space } from '../design/tokens';
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

/** 서로 배타적인 선택지를 한 줄에 나란히 보여주는 조절기. 선택된 칸은 흰 면이 떠오르고 글자가 굵어진다. */
export function SegmentedControl<T extends string>({ options, value, onChange, label }: SegmentedControlProps<T>) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.track}>
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
            style={styles.segmentOuter}
            contentStyle={[styles.segment, selected && styles.segmentOn]}
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
  segmentOuter: { flex: 1 },
  segment: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: space.xs, borderRadius: radius.control + 2 },
  segmentOn: { backgroundColor: colors.surface },
});
