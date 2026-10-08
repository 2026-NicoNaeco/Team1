import { useState } from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, layout, radius, shadow, space, typography } from '../design/tokens';
import { useUiStore } from '../state/uiStore';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

/** 지도 위에 떠 있는 검색 버튼. 눌러서 검색 화면으로 이동한다. */
export function SearchButton({
  placeholder,
  value,
  onPress,
  style,
  testID,
}: {
  placeholder: string;
  value?: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={value ?? placeholder}
      accessibilityHint="누르면 목적지를 검색해요"
      onPress={onPress}
      pressedScale={0.98}
      style={style}
      contentStyle={({ pressed }) => [styles.button, shadow.floating, pressed && styles.pressed]}
    >
      <Icon name="search" size={22} color={colors.primary} strokeWidth={2.4} />
      <Text variant="lead" color={value ? colors.text : colors.textTertiary} style={styles.buttonText} numberOfLines={2}>
        {value ?? placeholder}
      </Text>
    </PressableScale>
  );
}

interface SearchInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  onSubmit?: () => void;
  testID?: string;
}

/** 검색 화면의 입력창. 포커스되면 테두리가 진해지고, 입력값이 있으면 지우기 버튼이 나타난다. */
export function SearchInput({ value, onChangeText, placeholder, autoFocus, onSubmit, testID }: SearchInputProps) {
  const [focused, setFocused] = useState(false);
  const devScale = useUiStore((s) => s.devFontScale);
  return (
    <View style={[styles.input, focused && styles.inputFocused]}>
      <Icon name="search" size={22} color={focused ? colors.primary : colors.textTertiary} />
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={placeholder}
        maxFontSizeMultiplier={2}
        selectionColor={colors.primary}
        style={[
          styles.textInput,
          devScale === 1 ? null : { fontSize: (typography.lead.fontSize ?? 17) * devScale },
        ]}
      />
      {value.length > 0 ? (
        <IconButton icon="close" label="검색어 지우기" onPress={() => onChangeText('')} size={40} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    paddingHorizontal: space.xl - 2,
    paddingVertical: space.sm,
    borderRadius: radius.round,
    backgroundColor: colors.surface,
  },
  pressed: { backgroundColor: colors.surfaceMuted },
  buttonText: { flex: 1 },
  input: {
    flex: 1,
    // 큰 글자에서도 입력창이 화면 밖으로 밀려나지 않고 줄어들 수 있게 한다
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 52,
    paddingLeft: space.lg,
    paddingRight: space.xs,
    borderRadius: radius.field,
    backgroundColor: colors.surfaceStrong,
    borderWidth: 2,
    borderColor: colors.surfaceStrong,
  },
  inputFocused: { backgroundColor: colors.surface, borderColor: colors.primary },
  textInput: {
    flex: 1,
    minWidth: 0,
    ...typography.lead,
    fontWeight: '500',
    color: colors.text,
    paddingVertical: space.sm,
    minHeight: layout.minTouch,
    // 웹에서 기본 포커스 윤곽선 대신 컨테이너의 테두리로 포커스를 보여준다
    outlineStyle: 'none',
  } as never,
});
