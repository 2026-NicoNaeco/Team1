import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space } from '../design/tokens';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

/**
 * 안내 메시지. 성격이 다른 안내를 서로 다른 색과 아이콘으로 구분한다.
 * - info: 참고 정보 / caution: 알아 두면 좋은 점 / error: 실제 오류 / unknown: 확인할 수 없는 정보
 * 모든 주의사항에 같은 경고 아이콘과 강한 색을 쓰지 않는다.
 */
export type NoticeTone = 'info' | 'caution' | 'error' | 'unknown';

const TONES: Record<NoticeTone, { bg: string; fg: string; icon: IconName }> = {
  info: { bg: colors.infoBg, fg: colors.info, icon: 'info' },
  caution: { bg: colors.cautionBg, fg: colors.caution, icon: 'clock' },
  error: { bg: colors.dangerBg, fg: colors.dangerText, icon: 'alert-circle' },
  unknown: { bg: colors.surfaceStrong, fg: colors.textSecondary, icon: 'help' },
};

interface NoticeProps {
  tone?: NoticeTone;
  title?: string;
  text: string;
  icon?: IconName;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Notice({ tone = 'info', title, text, icon, actionLabel, onAction, style, testID }: NoticeProps) {
  const t = TONES[tone];
  return (
    <View testID={testID} accessibilityRole={tone === 'error' ? 'alert' : undefined} style={[styles.box, { backgroundColor: t.bg }, style]}>
      <View style={styles.row}>
        <View style={styles.icon}>
          <Icon name={icon ?? t.icon} size={20} color={t.fg} />
        </View>
        <View style={styles.body}>
          {title ? (
            <Text variant="bodyStrong" color={t.fg}>
              {title}
            </Text>
          ) : null}
          <Text variant="caption" color={t.fg}>
            {text}
          </Text>
        </View>
      </View>
      {actionLabel && onAction ? (
        <Button title={actionLabel} variant="tertiary" size="small" fullWidth={false} onPress={onAction} style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.field, padding: space.lg, gap: space.xs },
  row: { flexDirection: 'row', gap: space.md },
  icon: { paddingTop: 1 },
  body: { flex: 1, gap: 2 },
  action: { alignSelf: 'flex-start', marginLeft: 28 },
});
