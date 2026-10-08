import { StyleSheet, View } from 'react-native';
import { colors, radius, space } from '../design/tokens';
import { Icon } from './Icon';
import { Text } from './Text';

/** 경로 식별 글자(A, B, C). 지도·카드·상세에서 같은 글자로 같은 경로를 가리킨다. */
export function LetterBadge({ letter, selected = false, size = 32 }: { letter: string; selected?: boolean; size?: number }) {
  return (
    <View
      aria-hidden
      style={[styles.letter, { width: size, height: size }, selected ? styles.letterOn : styles.letterOff]}
    >
      <Text variant="bodyStrong" color={colors.onPrimary}>
        {letter}
      </Text>
    </View>
  );
}

/** "맞춤 추천": 현재 설정으로 먼저 보여주는 경로. "선택됨"과는 다른 상태다. */
export function RecommendBadge() {
  return (
    <View style={styles.recommend}>
      <Text variant="captionStrong" color={colors.primary}>
        맞춤 추천
      </Text>
    </View>
  );
}

/** 지금 선택한 경로 표시: 체크 + 글자 */
export function SelectedMark() {
  return (
    <View style={styles.selected}>
      <Icon name="check" size={14} color={colors.onPrimary} strokeWidth={3} />
      <Text variant="captionStrong" color={colors.onPrimary}>
        선택됨
      </Text>
    </View>
  );
}

/** 데모·시뮬레이션 표시 */
export function DemoBadge({ label = '데모 데이터' }: { label?: string }) {
  return (
    <View style={styles.demo}>
      <Text variant="micro" color={colors.textSecondary}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  letter: { borderRadius: radius.control - 2, alignItems: 'center', justifyContent: 'center' },
  letterOn: { backgroundColor: colors.primary },
  letterOff: { backgroundColor: '#3B4A54' },
  recommend: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  selected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  demo: {
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.surfaceMuted,
  },
});
