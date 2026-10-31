import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { colors, mapColors, radius, shadow, space } from '../design/tokens';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { ROAD_DATA_ATTRIBUTION } from '../services/backend/samplePlaces';
import { KAKAO_JS_KEY } from '../services/config';
import { LoadingBar, SkeletonBlock } from '../ui/StateViews';
import { Text } from '../ui/Text';
import { KAKAO_LOAD_STAGES, type KakaoLoadStage } from './kakaoLoading';
import { buildKakaoMapHtml, KAKAO_PAGE_ORIGIN } from './kakaoMapHtml';
import { buildKakaoScene, chipAnchorsGeo } from './kakaoScene';
import { NO_INSETS, type Insets, type MapAdapterProps } from './MapAdapter';
import { RoutePreviewMap } from './RoutePreviewMap';

/**
 * 카카오 지도(JavaScript SDK)를 WebView 에 띄운 실제 지도. 백엔드 모드에서 키가 있을 때 쓴다 (map/index.ts).
 * 장면 계산은 kakaoScene.ts, 그리기는 kakaoMapHtml.ts 의 페이지가 맡는다.
 * SDK 를 못 불러오면(키·도메인 등록 문제, 오프라인) 경로 모양만 그리는 임시 지도로 바꾼다.
 * 경로는 백엔드 도로망(OpenStreetMap 서울 전체)에서 나오므로 시연용이라는 표시와 OSM 출처를 항상 보여 준다.
 */

const READY_TIMEOUT_MS = 10_000;
const TILES_TIMEOUT_MS = 8_000;
const COVER_FADE_MS = 200;

type Status = 'loading' | 'ready' | 'failed';

/** 첫 타일이 그려질 때까지 빈 지도 대신 보여 준다. 표시는 시트 등에 가리지 않는 영역의 가운데에 둔다. */
function MapLoadingCover({ done, stage, insets }: { done: boolean; stage: KakaoLoadStage; insets: Insets }) {
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (!done) return;
    if (reducedMotion) {
      setGone(true);
      return;
    }
    Animated.timing(opacity, { toValue: 0, duration: COVER_FADE_MS, useNativeDriver: Platform.OS !== 'web' }).start(() => setGone(true));
  }, [done, reducedMotion, opacity]);

  if (gone) return null;
  return (
    <Animated.View testID="map-loading" style={[styles.cover, { opacity }]}>
      <SkeletonBlock height={0} style={styles.coverFill} />
      <View style={[styles.coverCenter, { top: insets.top, bottom: insets.bottom }]}>
        <LoadingBar message="지도를 불러오고 있어요" {...KAKAO_LOAD_STAGES[stage]} style={[styles.coverLabel, shadow.floating]} />
      </View>
    </Animated.View>
  );
}

export function KakaoMapView(props: MapAdapterProps) {
  const { routes, markers, camera, insets = NO_INSETS, interactive = true, onRoutePress, accessibilityLabel, testID } = props;
  const webview = useRef<WebView>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [tilesReady, setTilesReady] = useState(false);
  const [loadStage, setLoadStage] = useState<KakaoLoadStage>('page');
  const html = useMemo(() => buildKakaoMapHtml(KAKAO_JS_KEY), []);

  // 칩 위치는 경로 모양이 바뀔 때만 다시 고른다 (주행 중에는 traveledM 만 바뀐다)
  const pathsKey = routes.map((r) => `${r.id}:${r.path.length}:${r.path[0]?.lat},${r.path[0]?.lng}`).join('|');
  const chipAnchors = useMemo(() => chipAnchorsGeo(routes), [pathsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const sceneJson = useMemo(
    () => JSON.stringify(buildKakaoScene({ routes, markers, camera, insets, interactive }, chipAnchors)),
    [routes, markers, camera, insets, interactive, chipAnchors],
  );

  useEffect(() => {
    if (status !== 'ready') return;
    webview.current?.injectJavaScript(`window.__applyScene(${sceneJson}); true;`);
  }, [status, sceneJson]);

  useEffect(() => {
    if (status !== 'loading') return;
    const timer = setTimeout(() => setStatus('failed'), READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [status]);

  // 타일 신호가 오지 않아도 덮개가 남지 않게 한다
  useEffect(() => {
    if (status !== 'ready' || tilesReady) return;
    const timer = setTimeout(() => setTilesReady(true), TILES_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [status, tilesReady]);

  const onMessage = (e: WebViewMessageEvent) => {
    let msg: { type?: string; id?: string; message?: string };
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'sdkLoaded') setLoadStage('sdk');
    else if (msg.type === 'ready') {
      setStatus('ready');
      setLoadStage('tiles');
    } else if (msg.type === 'tilesLoaded') setTilesReady(true);
    else if (msg.type === 'routePress' && msg.id) onRoutePress?.(msg.id);
    else if (msg.type === 'error') {
      console.warn(`[KakaoMapView] 카카오 지도를 불러오지 못했어요: ${msg.message ?? ''}`);
      setStatus((s) => (s === 'ready' ? s : 'failed'));
    }
  };

  if (status === 'failed') return <RoutePreviewMap {...props} />;

  return (
    <View style={styles.root} testID={testID} accessible accessibilityLabel={accessibilityLabel}>
      <WebView
        ref={webview}
        source={{ html, baseUrl: KAKAO_PAGE_ORIGIN }}
        originWhitelist={['*']}
        onMessage={onMessage}
        onError={() => setStatus((s) => (s === 'ready' ? s : 'failed'))}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        setSupportMultipleWindows={false}
        style={styles.webview}
      />
      <MapLoadingCover done={tilesReady} stage={loadStage} insets={insets} />
      <View style={[styles.attribution, { bottom: insets.bottom + space.sm }]}>
        <Text variant="micro" color={colors.textTertiary}>
          시연용 경로 · {ROAD_DATA_ATTRIBUTION}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: mapColors.land, overflow: 'hidden' },
  webview: { flex: 1, backgroundColor: mapColors.land },
  cover: { ...StyleSheet.absoluteFill, backgroundColor: mapColors.land, pointerEvents: 'none' },
  coverFill: { ...StyleSheet.absoluteFill, height: '100%', borderRadius: 0 },
  coverCenter: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  coverLabel: { width: 240, maxWidth: '80%', padding: space.lg, borderRadius: radius.field, backgroundColor: colors.surface },
  attribution: {
    position: 'absolute',
    right: space.md,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.round,
    backgroundColor: 'rgba(255,255,255,0.82)',
    pointerEvents: 'none',
  },
});
