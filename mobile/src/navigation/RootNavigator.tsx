import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet, View } from 'react-native';
import { colors, radius } from '../design/tokens';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { ArrivalScreen } from '../screens/ArrivalScreen';
import { DemoInfoScreen } from '../screens/DemoInfoScreen';
import { DevToolsScreen } from '../screens/DevToolsScreen';
import { HistoryDetailScreen } from '../screens/HistoryDetailScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { MapHomeScreen } from '../screens/MapHomeScreen';
import { NavigationScreen } from '../screens/NavigationScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { PreferencesScreen } from '../screens/PreferencesScreen';
import { RouteCompareScreen } from '../screens/RouteCompareScreen';
import { RouteDetailScreen } from '../screens/RouteDetailScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { useAppStore } from '../state/appStore';
import { Icon } from '../ui/Icon';
import { TabBar } from './TabBar';
import type { RootStackParamList, TabParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function Tabs() {
  return (
    <Tab.Navigator
      initialRouteName="Map"
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
    >
      <Tab.Screen name="Map" component={MapHomeScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

/** 저장된 설정을 읽는 아주 짧은 동안의 화면. 기기에서는 시작 화면이 이 자리를 덮고 있다. */
function Splash() {
  return (
    <View style={styles.splash} aria-hidden>
      <View style={styles.mark}>
        <Icon name="navigation" size={34} color={colors.onPrimary} />
      </View>
    </View>
  );
}

/**
 * 루트 내비게이터.
 * 온보딩을 마치기 전에는 온보딩 화면만 존재한다. 마치면(또는 모든 데이터를 삭제하면) 화면 구성이 자동으로 바뀐다.
 * 하단 탭은 탭 화면에서만 보이고, 검색·비교·상세·주행·도착 화면에서는 집중을 위해 숨겨진다.
 */
export function RootNavigator() {
  const hydrated = useAppStore((s) => s.hydrated);
  const onboarded = useAppStore((s) => s.profile.onboardingCompleted);
  const reducedMotion = useReducedMotion();

  if (!hydrated) return <Splash />;

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: reducedMotion ? 'none' : 'default',
      }}
    >
      {!onboarded ? (
        <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ animation: 'fade' }} />
      ) : (
        <>
          <Stack.Screen name="Tabs" component={Tabs} />
          <Stack.Screen name="Search" component={SearchScreen} />
          <Stack.Screen name="RouteCompare" component={RouteCompareScreen} />
          <Stack.Screen name="RouteDetail" component={RouteDetailScreen} />
          <Stack.Screen name="Navigation" component={NavigationScreen} options={{ gestureEnabled: false }} />
          <Stack.Screen name="Arrival" component={ArrivalScreen} options={{ gestureEnabled: false }} />
          <Stack.Screen name="HistoryDetail" component={HistoryDetailScreen} />
          <Stack.Screen name="Preferences" component={PreferencesScreen} />
          <Stack.Screen name="DemoInfo" component={DemoInfoScreen} />
          <Stack.Screen name="DevTools" component={DevToolsScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  mark: { width: 76, height: 76, borderRadius: radius.card, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
