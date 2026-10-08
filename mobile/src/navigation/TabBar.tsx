import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, layout, radius, space } from '../design/tokens';
import { Icon, type IconName } from '../ui/Icon';
import { Text } from '../ui/Text';

const TABS: Record<string, { label: string; icon: IconName }> = {
  Map: { label: '지도', icon: 'map' },
  History: { label: '운전 기록', icon: 'history' },
  Settings: { label: '설정', icon: 'settings' },
};

/**
 * 하단 탭. 선택된 탭은 색뿐 아니라 배경 알약, 굵은 글자, 접근성 상태로도 구분한다.
 * 기록 탭의 이름은 "운전 기록"이지만 화면 안에서는 항상 "시뮬레이션 기록"임을 밝힌다.
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
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
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
            <View style={[styles.iconPill, focused && styles.iconPillOn]}>
              <Icon name={tab.icon} size={22} color={focused ? colors.primary : colors.textSecondary} strokeWidth={focused ? 2.4 : 2} />
            </View>
            <Text variant={focused ? 'captionStrong' : 'caption'} color={focused ? colors.primary : colors.textSecondary}>
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
    paddingTop: space.xs + 2,
    minHeight: layout.tabBarHeight,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: layout.minTouch },
  iconPill: { width: 56, height: 30, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  iconPillOn: { backgroundColor: colors.primarySoft },
});
