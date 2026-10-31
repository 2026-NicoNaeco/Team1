import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { colors } from '../design/tokens';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Icon } from './Icon';

/**
 * 온보딩 첫 화면의 일러스트: 굽이진 길 위를 달리는 작은 차와 도착 핀, 그리고 "초보운전" 스티커.
 * 장식이므로 스크린리더에서는 숨긴다.
 */
export function RoadHero({ height = 232 }: { height?: number }) {
  return (
    <View aria-hidden style={{ height }}>
      <Svg width="100%" height="100%" viewBox="0 0 320 232" preserveAspectRatio="xMidYMid meet">
        {/* 배경 */}
        <Circle cx="158" cy="124" r="104" fill={colors.primarySoft} />
        <Circle cx="228" cy="70" r="52" fill={colors.primarySofter} />
        <Circle cx="64" cy="64" r="26" fill="#FFFFFF" opacity="0.9" />
        <Circle cx="86" cy="58" r="20" fill="#FFFFFF" opacity="0.9" />
        <Circle cx="44" cy="68" r="18" fill="#FFFFFF" opacity="0.9" />

        {/* 길 */}
        <Path d="M22 206 C104 214 116 150 172 138 S248 108 274 54" stroke="#3A4654" strokeWidth="38" strokeLinecap="round" fill="none" />
        <Path
          d="M22 206 C104 214 116 150 172 138 S248 108 274 54"
          stroke="#FFFFFF"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="9 12"
          fill="none"
        />

        {/* 도착 핀 */}
        <Ellipse cx="274" cy="82" rx="14" ry="4.5" fill="#191F28" opacity="0.18" />
        <Path d="M274 78 C268 66 256 60 256 46 A18 18 0 1 1 292 46 C292 60 280 66 274 78 Z" fill={colors.primary} />
        <Circle cx="274" cy="46" r="7" fill="#FFFFFF" />

        {/* 차 (길의 기울기에 맞춰 살짝 기울임) */}
        <G transform="translate(122 168) rotate(-20)">
          <Rect x="-34" y="-8" width="68" height="22" rx="8" fill="#FFC53D" />
          <Path d="M-19 -8 L-11 -22 H13 L24 -8 Z" fill="#FFC53D" />
          <Path d="M-14 -10 L-8 -19 H-1 V-10 Z" fill="#FFFFFF" opacity="0.95" />
          <Path d="M4 -10 V-19 H11 L18 -10 Z" fill="#FFFFFF" opacity="0.95" />
          <Circle cx="-19" cy="14" r="7" fill="#191F28" />
          <Circle cx="-19" cy="14" r="2.8" fill="#C9D2D9" />
          <Circle cx="19" cy="14" r="7" fill="#191F28" />
          <Circle cx="19" cy="14" r="2.8" fill="#C9D2D9" />
        </G>

        {/* 초보운전 스티커 */}
        <G transform="translate(52 128) rotate(-8)">
          <Rect x="0" y="0" width="64" height="24" rx="6" fill="#FFE27A" />
          <Path d="M52 24 L58 33 L46 24 Z" fill="#FFE27A" />
          <SvgText x="32" y="16.5" fontSize="12" fontWeight="700" fill="#191F28" textAnchor="middle">
            초보운전
          </SvgText>
        </G>

        {/* 반짝임 */}
        <Path d="M30 112 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3 z" fill="#FFC53D" />
        <Path d="M246 150 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5 z" fill={colors.primary} opacity="0.55" />
      </Svg>
    </View>
  );
}

/**
 * 도착 화면의 완료 표시: 체크가 톡 하고 나타나고 둘레가 한 번 퍼진다. 모션 줄이기를 켜면 바로 보인다.
 */
export function DoneBadge({ done = true, size = 88 }: { done?: boolean; size?: number }) {
  const reducedMotion = useReducedMotion();
  const pop = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const ring = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reducedMotion) {
      pop.setValue(1);
      ring.setValue(1);
      return;
    }
    const native = Platform.OS !== 'web';
    Animated.sequence([
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: native }),
      Animated.timing(ring, { toValue: 1, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: native }),
    ]).start();
  }, [pop, ring, reducedMotion]);

  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.35] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.45, 0] });
  const tone = done ? colors.primary : colors.textTertiary;
  return (
    <View aria-hidden style={[styles.doneBox, { width: size * 1.5, height: size * 1.5 }]}>
      <Animated.View
        style={[styles.doneRing, { width: size, height: size, borderRadius: size / 2, backgroundColor: tone, opacity: ringOpacity, transform: [{ scale: ringScale }] }]}
      />
      <Animated.View
        style={[styles.doneCircle, { width: size, height: size, borderRadius: size / 2, backgroundColor: tone, transform: [{ scale: pop }] }]}
      >
        <Icon name={done ? 'check' : 'flag'} size={Math.round(size * 0.46)} color="#FFFFFF" strokeWidth={done ? 3.4 : 2.6} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  doneBox: { alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  doneRing: { position: 'absolute' },
  doneCircle: { alignItems: 'center', justifyContent: 'center' },
});
