import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, layout, radius, space } from '../design/tokens';
import { useFontScale } from '../hooks/useFontScale';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

interface ConfirmSheetProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** danger: 되돌릴 수 없는 삭제처럼 위험한 확정 */
  tone?: 'danger' | 'primary';
  icon?: IconName;
  /** 확정 처리 중. 이때는 닫지 않는다 */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  confirmTestID?: string;
}

/** 글자가 이 배율보다 크면 두 버튼을 세로로 쌓는다 (경로 비교 화면의 하단 버튼과 같은 기준) */
const STACK_FONT_SCALE = 1.3;

/**
 * 화면 아래에서 올라오는 확인 시트. 스크롤 위치와 상관없이 항상 화면 안에 보인다.
 * 바깥(어두운 부분)을 누르거나 안드로이드 뒤로 가기를 누르면 취소된다.
 */
export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = '취소',
  tone = 'danger',
  icon = 'alert-circle',
  busy = false,
  onConfirm,
  onCancel,
  confirmTestID,
}: ConfirmSheetProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const stacked = useFontScale() > STACK_FONT_SCALE;
  const cancel = () => {
    if (!busy) onCancel();
  };
  const danger = tone === 'danger';

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reducedMotion ? 'none' : 'fade'}
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={cancel}
    >
      <View style={styles.root}>
        <Pressable style={styles.scrim} onPress={cancel} accessibilityRole="button" accessibilityLabel={cancelLabel} />
        <View
          accessibilityViewIsModal
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.lg) + space.sm }]}
          testID="confirm-sheet"
        >
          <View style={[styles.icon, { backgroundColor: danger ? colors.dangerBg : colors.primarySoft }]}>
            <Icon name={icon} size={26} color={danger ? colors.dangerText : colors.primaryStrong} />
          </View>
          <View style={styles.text}>
            <Text variant="title2" accessibilityRole="header">
              {title}
            </Text>
            <Text variant="body" color={colors.textSecondary}>
              {message}
            </Text>
          </View>
          <View style={[styles.buttons, stacked && styles.buttonsStacked]}>
            <Button title={cancelLabel} variant="neutral" style={stacked ? null : styles.flex} onPress={cancel} disabled={busy} />
            <Button
              testID={confirmTestID}
              title={confirmLabel}
              variant={danger ? 'danger' : 'primary'}
              style={stacked ? null : styles.flex}
              loading={busy}
              onPress={onConfirm}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: layout.screenX,
    paddingTop: space.xl,
    gap: space.lg,
  },
  icon: { width: 52, height: 52, borderRadius: radius.round, alignItems: 'center', justifyContent: 'center' },
  text: { gap: space.sm },
  buttons: { flexDirection: 'row', gap: space.sm },
  // column-reverse 로 두면 확정 버튼이 위에 온다
  buttonsStacked: { flexDirection: 'column-reverse' },
  flex: { flex: 1 },
});
