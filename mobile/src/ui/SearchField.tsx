import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, layout, radius, shadow, space, typography } from '../design/tokens';
import { useUiStore } from '../state/uiStore';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
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
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={value ?? placeholder}
      accessibilityHint="누르면 목적지를 검색해요"
      onPress={onPress}
      style={({ pressed }) => [styles.button, shadow.floating, pressed && styles.pressed, style]}
    >
      <Icon name="search" size={22} color={colors.primary} />
      <Text variant="bodyStrong" color={value ? colors.text : colors.textSecondary} style={styles.buttonText} numberOfLines={2}>
        {value ?? placeholder}
      </Text>
    </Pressable>
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
      <Icon name="search" size={22} color={focused ? colors.primary : colors.textSecondary} />
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={placeholder}
        maxFontSizeMultiplier={2}
        style={[
          styles.textInput,
          devScale === 1 ? null : { fontSize: (typography.body.fontSize ?? 16) * devScale },
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
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  pressed: { backgroundColor: colors.surfaceMuted },
  buttonText: { flex: 1 },
  input: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: layout.minTouch + 4,
    paddingLeft: space.lg,
    paddingRight: space.xs,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
  },
  inputFocused: { borderColor: colors.primary, borderWidth: 2 },
  textInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    paddingVertical: space.sm,
    // 웹에서 기본 포커스 윤곽선 대신 컨테이너의 테두리로 포커스를 보여준다
    outlineStyle: 'none',
  } as never,
});
