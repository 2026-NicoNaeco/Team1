import { memo } from 'react';
import Svg, { G, Path } from 'react-native-svg';
import type { ManeuverKind } from '../domain/types';
import { colors } from '../design/tokens';

interface Props {
  maneuver: ManeuverKind;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/**
 * 주행 안내용 큰 회전 화살표 (48x48 격자).
 * 굵은 선과 둥근 끝으로 멀리서도 방향이 읽히게 한다. 급회전은 같은 회전 화살표를 45° 더 틀어 표현한다.
 */
const RIGHT = 'M16 43 V27 Q16 19 24 19 H35';
const RIGHT_HEAD = 'M29 12 L36 19 L29 26';
const LEFT = 'M32 43 V27 Q32 19 24 19 H13';
const LEFT_HEAD = 'M19 12 L12 19 L19 26';

export const ManeuverIcon = memo(function ManeuverIcon({
  maneuver,
  size = 64,
  color = colors.text,
  strokeWidth = 5,
}: Props) {
  const line = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  const rotate = (deg: number) => `rotate(${deg} 24 28)`;

  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {(maneuver === 'DEPART' || maneuver === 'STRAIGHT') && (
        <G {...line}>
          <Path d="M24 43 V10" />
          <Path d="M13 21 L24 10 L35 21" />
        </G>
      )}
      {maneuver === 'RIGHT' && (
        <G {...line}>
          <Path d={RIGHT} />
          <Path d={RIGHT_HEAD} />
        </G>
      )}
      {maneuver === 'LEFT' && (
        <G {...line}>
          <Path d={LEFT} />
          <Path d={LEFT_HEAD} />
        </G>
      )}
      {maneuver === 'SHARP_RIGHT' && (
        <G {...line} transform={rotate(45)}>
          <Path d={RIGHT} />
          <Path d={RIGHT_HEAD} />
        </G>
      )}
      {maneuver === 'SHARP_LEFT' && (
        <G {...line} transform={rotate(-45)}>
          <Path d={LEFT} />
          <Path d={LEFT_HEAD} />
        </G>
      )}
      {maneuver === 'U_TURN' && (
        <G {...line}>
          <Path d="M35 43 V20 Q35 8 23 8 Q11 8 11 20 V33" />
          <Path d="M4 26 L11 34 L18 26" />
        </G>
      )}
      {maneuver === 'ROUNDABOUT' && (
        <G {...line}>
          <Path d="M24 43 V35" />
          <Path d="M17 24 A9 9 0 1 0 31 17" />
          <Path d="M31 17 L38 10" />
          <Path d="M30 10 H38 V18" />
        </G>
      )}
      {maneuver === 'MERGE' && (
        <G {...line}>
          <Path d="M13 43 L24 27 V10" />
          <Path d="M35 43 L24 27" />
          <Path d="M15 19 L24 10 L33 19" />
        </G>
      )}
      {maneuver === 'DIVERGE' && (
        <G {...line}>
          <Path d="M17 43 V12" />
          <Path d="M17 30 L35 14" />
          <Path d="M27 12 L36 13 L34 22" />
        </G>
      )}
      {maneuver === 'ARRIVE' && (
        <G {...line}>
          <Path d="M14 43 V8" />
          <Path d="M14 10 H36 L30 18 L36 26 H14" />
        </G>
      )}
    </Svg>
  );
});

export const MANEUVER_LABEL: Record<ManeuverKind, string> = {
  DEPART: '출발',
  STRAIGHT: '직진',
  LEFT: '좌회전',
  RIGHT: '우회전',
  SHARP_LEFT: '급좌회전',
  SHARP_RIGHT: '급우회전',
  U_TURN: '유턴',
  ROUNDABOUT: '회전교차로',
  MERGE: '합류',
  DIVERGE: '진출',
  ARRIVE: '도착',
};
