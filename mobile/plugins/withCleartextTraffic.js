const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

/**
 * 릴리스 APK 에서 HTTP 통신을 허용한다. 카카오 지도는 http://localhost 로 띄운 WebView 안에서 돌아서
 * 지도 타일도 HTTP 로 받고, Android 는 릴리스 빌드의 HTTP 통신을 기본으로 막는다.
 */
module.exports = (config) =>
  withAndroidManifest(config, (c) => {
    AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults).$['android:usesCleartextTraffic'] = 'true';
    return c;
  });
