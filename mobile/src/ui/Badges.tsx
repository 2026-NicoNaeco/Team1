import { StyleSheet, View } from 'react-native';
import { colors, radius, space } from '../design/tokens';
import { Icon } from './Icon';
import { Text } from './Text';

/** 경로 식별 글자(A, B, C). 지도·카드·상세에서 같은 글자로 같은 경로를 가리킨다. */
export function LetterBadge({ letter, selected = false, size = 32 }: { letter: string; selected?: boolean; size?: number }) {
  return (
    <View
      aria-hidden
      style={[styles.letter, { width: size, height: size, borderRadius: Math.round(size * 0.32) }, selected ? styles.letterOn : styles.letterOff]}
    >
      <Text variant="bodyStrong" color={selected ? colors.onPrimary : colors.textSecondary}>
        {letter}
      </Text>
    </View>
  );
}

/** "맞춤 추천": 현재 설정으로 먼저 보여주는 경로. "선택됨"과는 다른 상태다. */
export function RecommendBadge() {
  return (
    <View style={styles.recommend}>
      <Icon name="check-circle" size={13} color={colors.primaryStrong} />
      <Text variant="micro" color={colors.primaryStrong}>
        맞춤 추천
      </Text>
    </View>
  );
}

/** 지금 선택한 경로 표시: 체크 동그라미. 글자 설명은 부모의 접근성 라벨이 맡는다. */
export function SelectedMark() {
  return (
    <View style={styles.selected} aria-hidden>
      <Icon name="check" size={16} color={colors.onPrimary} strokeWidth={3.2} />
    </View>
  );
}

type PillTone = 'neutral' | 'caution' | 'primary';

const PILL: Record<PillTone, { bg: string; fg: string }> = {
  neutral: { bg: colors.surfaceStrong, fg: colors.textSecondary },
  caution: { bg: colors.cautionBg, fg: colors.caution },
  primary: { bg: colors.primarySoft, fg: colors.primaryStrong },
};

/** 짧은 상태 표시 알약 (예: 허용 시간 초과) */
export function StatusPill({ label, tone = 'neutral' }: { label: string; tone?: PillTone }) {
  return (
    <View style={[styles.pill, { backgroundColor: PILL[tone].bg }]}>
      <Text variant="micro" color={PILL[tone].fg}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  letter: { alignItems: 'center', justifyContent: 'center' },
  letterOn: { backgroundColor: colors.primary },
  letterOff: { backgroundColor: colors.surfaceStrong },
  recommend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.round,
    backgroundColor: colors.primarySoft,
  },
  selected: {
    width: 26,
    height: 26,
    borderRadius: radius.round,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.round,
  },
});
