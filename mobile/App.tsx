import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from './src/design/tokens';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useAppStore } from './src/state/appStore';
import { initTripSync } from './src/state/tripStore';
import { ToastHost } from './src/ui/Toast';

// 저장된 설정을 불러올 때까지 처음 화면을 붙잡아 둔다 (빈 화면이 깜빡이지 않게)
SplashScreen.preventAutoHideAsync().catch(() => undefined);

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
  },
};

export default function App() {
  const hydrated = useAppStore((s) => s.hydrated);

  useEffect(() => {
    initTripSync();
    void useAppStore.getState().hydrate();
  }, []);

  useEffect(() => {
    if (hydrated) SplashScreen.hideAsync().catch(() => undefined);
  }, [hydrated]);

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <NavigationContainer theme={theme} documentTitle={{ formatter: () => '뉴비맵' }}>
          <RootNavigator />
        </NavigationContainer>
        <ToastHost />
      </View>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
