import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, layout, radius, space } from '../design/tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

interface ListRowProps {
  title: string;
  subtitle?: string;
  value?: string;
  icon?: IconName;
  onPress?: () => void;
  /** 오른쪽 화살표 표시 (이동하는 행) */
  chevron?: boolean;
  destructive?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** 설정·기록 목록의 한 줄. 눌러서 이동하거나 값을 보여준다. */
export function ListRow({
  title,
  subtitle,
  value,
  icon,
  onPress,
  chevron = Boolean(onPress),
  destructive,
  style,
  testID,
}: ListRowProps) {
  const color = destructive ? colors.danger : colors.text;
  const body = (
    <>
      {icon ? (
        <View style={styles.icon}>
          <Icon name={icon} size={22} color={destructive ? colors.danger : colors.textSecondary} />
        </View>
      ) : null}
      <View style={styles.text}>
        <Text variant="bodyStrong" color={color}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color={colors.textSecondary}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="caption" color={colors.textSecondary} style={styles.value} align="right">
          {value}
        </Text>
      ) : null}
      {chevron ? <Icon name="chevron-right" size={20} color={colors.textSecondary} /> : null}
    </>
  );
  if (!onPress) {
    return (
      <View testID={testID} style={[styles.row, style]}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, style]}
    >
      {body}
    </Pressable>
  );
}

interface SwitchRowProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  testID?: string;
}

// react-native-web 은 켜진 상태의 손잡이 색을 thumbColor 와 별개로 받는다(네이티브 타입에는 없는 웹 전용 속성)
const WEB_SWITCH_PROPS = { activeThumbColor: '#FFFFFF' } as object;

/** 켜짐/꺼짐을 스위치 모양과 글자로 함께 보여준다 */
export function SwitchRow({ label, description, value, onValueChange, disabled, testID }: SwitchRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text variant="bodyStrong" color={disabled ? colors.textDisabled : colors.text}>
          {label}
        </Text>
        {description ? (
          <Text variant="caption" color={colors.textSecondary}>
            {description}
          </Text>
        ) : null}
      </View>
      <View style={styles.switchBox}>
        <Switch
          testID={testID}
          value={value}
          disabled={disabled}
          onValueChange={onValueChange}
          accessibilityLabel={label}
          trackColor={{ false: '#9AA9B1', true: colors.primary }}
          thumbColor="#FFFFFF"
          {...WEB_SWITCH_PROPS}
        />
        <Text variant="micro" color={colors.textSecondary}>
          {value ? '켜짐' : '꺼짐'}
        </Text>
      </View>
    </View>
  );
}

/** 구분선이 있는 카드형 묶음 */
export function Group({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const items = (Array.isArray(children) ? children : [children]).filter(Boolean);
  return (
    <View style={[styles.group, style]}>
      {items.map((child, i) => (
        <View key={i} style={i > 0 ? styles.divider : undefined}>
          {child}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: layout.minTouch + 8,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  pressed: { backgroundColor: colors.surfaceMuted },
  icon: { width: 28, alignItems: 'center' },
  text: { flex: 1, gap: 2 },
  value: { flexShrink: 1, maxWidth: '45%' },
  switchBox: { alignItems: 'center', gap: 2 },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
});
