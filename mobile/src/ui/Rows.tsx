import { Children, type ReactNode } from 'react';
import { StyleSheet, Switch, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, layout, radius, space } from '../design/tokens';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { haptics } from './haptics';

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
  const color = destructive ? colors.dangerText : colors.text;
  const body = (
    <>
      {icon ? (
        <View style={[styles.icon, destructive ? styles.iconDanger : styles.iconNormal]}>
          <Icon name={icon} size={20} color={destructive ? colors.dangerText : colors.primaryStrong} />
        </View>
      ) : null}
      <View style={styles.text}>
        <Text variant="lead" color={color}>
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
      {chevron ? <Icon name="chevron-right" size={20} color={colors.textTertiary} /> : null}
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
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      pressedScale={0.99}
      style={style}
      contentStyle={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {body}
    </PressableScale>
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

/** 켜짐/꺼짐은 스위치의 위치와 색, 접근성 상태로 함께 전달한다 */
export function SwitchRow({ label, description, value, onValueChange, disabled, testID }: SwitchRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text variant="lead" color={disabled ? colors.textDisabled : colors.text}>
          {label}
        </Text>
        {description ? (
          <Text variant="caption" color={colors.textSecondary}>
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        testID={testID}
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          haptics.selection();
          onValueChange(next);
        }}
        accessibilityLabel={label}
        trackColor={{ false: '#B0B8C1', true: colors.primary }}
        ios_backgroundColor="#B0B8C1"
        thumbColor="#FFFFFF"
        {...WEB_SWITCH_PROPS}
      />
    </View>
  );
}

/** 구분선이 있는 카드형 묶음 */
export function Group({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.group, style]}>
      {items.map((child, i) => (
        <View key={i}>
          {i > 0 ? <View style={styles.divider} /> : null}
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
    minHeight: 68,
    paddingVertical: space.md,
    paddingHorizontal: layout.cardPad,
    backgroundColor: colors.surface,
  },
  pressed: { backgroundColor: colors.surfaceMuted },
  icon: { width: 40, height: 40, borderRadius: radius.round, alignItems: 'center', justifyContent: 'center' },
  iconNormal: { backgroundColor: colors.primarySoft },
  iconDanger: { backgroundColor: colors.dangerBg },
  text: { flex: 1, gap: 2 },
  value: { flexShrink: 1, maxWidth: '45%' },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: layout.cardPad },
});
