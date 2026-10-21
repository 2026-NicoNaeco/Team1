import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, layout, space } from '../design/tokens';
import { Icon, type IconName } from '../ui/Icon';
import { Text } from '../ui/Text';
import { haptics } from '../ui/haptics';

const TABS: Record<string, { label: string; icon: IconName }> = {
  Map: { label: '지도', icon: 'map' },
  History: { label: '주행 기록', icon: 'history' },
  Settings: { label: '설정', icon: 'settings' },
};

/**
 * 하단 탭. 선택된 탭은 색뿐 아니라 굵은 아이콘·글자와 접근성 상태로도 구분한다.
 */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View accessibilityRole="tablist" style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.sm) }]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const tab = TABS[route.name] ?? { label: route.name, icon: 'map' as IconName };
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            haptics.selection();
            navigation.navigate(route.name, route.params);
          }
        };
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            aria-selected={focused}
            onPress={onPress}
            style={styles.tab}
            testID={`tab-${route.name}`}
          >
            <Icon name={tab.icon} size={25} color={focused ? colors.primary : colors.textTertiary} strokeWidth={focused ? 2.5 : 2} />
            <Text variant="micro" color={focused ? colors.primaryStrong : colors.textTertiary} style={focused && styles.labelOn}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: space.sm,
    minHeight: layout.tabBarHeight,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: layout.minTouch },
  labelOn: { fontWeight: '700' },
});
