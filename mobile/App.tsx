import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from './src/design/tokens';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useAppStore } from './src/state/appStore';
import { initTripSync } from './src/state/tripStore';
import { ToastHost } from './src/ui/Toast';

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
  useEffect(() => {
    initTripSync();
    void useAppStore.getState().hydrate();
  }, []);

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <NavigationContainer theme={theme} documentTitle={{ formatter: () => '뉴비맵 (데모)' }}>
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
