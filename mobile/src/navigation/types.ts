import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type TabParamList = {
  Map: undefined;
  History: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Onboarding: undefined;
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  Search: { mode: 'destination' | 'origin' };
  RouteCompare: undefined;
  RouteDetail: { routeId: string };
  Navigation: { routeId: string; fromProgressM?: number };
  Arrival: undefined;
  HistoryDetail: { recordId: string };
  Preferences: undefined;
  DemoInfo: undefined;
  DevTools: undefined;
};

export type RootScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;

export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;
