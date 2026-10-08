import type { LucideIcon } from 'lucide-react-native';
import { memo } from 'react';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import AccidentIcon from 'lucide-react-native/icons/octagon-alert';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import ArrowRightLeft from 'lucide-react-native/icons/arrow-right-left';
import ArrowUp from 'lucide-react-native/icons/arrow-up';
import Banknote from 'lucide-react-native/icons/banknote';
import Car from 'lucide-react-native/icons/car';
import Check from 'lucide-react-native/icons/check';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import ChevronsRightLeft from 'lucide-react-native/icons/chevrons-right-left';
import CircleAlert from 'lucide-react-native/icons/circle-alert';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import CircleQuestionMark from 'lucide-react-native/icons/circle-question-mark';
import ClipboardList from 'lucide-react-native/icons/clipboard-list';
import Clock from 'lucide-react-native/icons/clock';
import Columns3 from 'lucide-react-native/icons/columns-3';
import CornerUpLeft from 'lucide-react-native/icons/corner-up-left';
import CornerUpRight from 'lucide-react-native/icons/corner-up-right';
import Flag from 'lucide-react-native/icons/flag';
import FaceNeutral from 'lucide-react-native/icons/face-neutral';
import FaceSlightlyFrowning from 'lucide-react-native/icons/face-slightly-frowning';
import FaceSlightlySmiling from 'lucide-react-native/icons/face-slightly-smiling';
import Gauge from 'lucide-react-native/icons/gauge';
import Info from 'lucide-react-native/icons/info';
import LocateFixed from 'lucide-react-native/icons/locate-fixed';
import MapIcon from 'lucide-react-native/icons/map';
import MapPin from 'lucide-react-native/icons/map-pin';
import Merge from 'lucide-react-native/icons/merge';
import Minus from 'lucide-react-native/icons/minus';
import Mountain from 'lucide-react-native/icons/mountain';
import Navigation from 'lucide-react-native/icons/navigation';
import Pause from 'lucide-react-native/icons/pause';
import Play from 'lucide-react-native/icons/play';
import Plus from 'lucide-react-native/icons/plus';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import Road from 'lucide-react-native/icons/road';
import Route from 'lucide-react-native/icons/route';
import Ruler from 'lucide-react-native/icons/ruler';
import Search from 'lucide-react-native/icons/search';
import Settings from 'lucide-react-native/icons/settings';
import Signpost from 'lucide-react-native/icons/signpost';
import SlidersHorizontal from 'lucide-react-native/icons/sliders-horizontal';
import Spline from 'lucide-react-native/icons/spline';
import Sparkles from 'lucide-react-native/icons/sparkles';
import Split from 'lucide-react-native/icons/split';
import Square from 'lucide-react-native/icons/square';
import Trash from 'lucide-react-native/icons/trash';
import TrafficCone from 'lucide-react-native/icons/traffic-cone';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';
import Undo2 from 'lucide-react-native/icons/undo-2';
import Users from 'lucide-react-native/icons/users';
import X from 'lucide-react-native/icons/x';
import { colors } from '../design/tokens';

const LUCIDE = {
  search: Search,
  back: ArrowLeft,
  'chevron-right': ChevronRight,
  'chevron-down': ChevronDown,
  'chevron-up': ChevronUp,
  check: Check,
  close: X,
  plus: Plus,
  minus: Minus,
  pin: MapPin,
  flag: Flag,
  navigation: Navigation,
  clock: Clock,
  route: Route,
  info: Info,
  warning: TriangleAlert,
  'alert-circle': CircleAlert,
  help: CircleQuestionMark,
  'check-circle': CircleCheck,
  settings: Settings,
  history: ClipboardList,
  map: MapIcon,
  trash: Trash,
  refresh: RefreshCw,
  pause: Pause,
  play: Play,
  stop: Square,
  car: Car,
  'turn-left': CornerUpLeft,
  'turn-right': CornerUpRight,
  'arrow-up': ArrowUp,
  'u-turn': Undo2,
  merge: Merge,
  split: Split,
  sliders: SlidersHorizontal,
  cone: TrafficCone,
  locate: LocateFixed,
  toll: Banknote,
  ruler: Ruler,
  road: Road,
  zone: Users,
  accident: AccidentIcon,
  traffic: Gauge,
  turn: Signpost,
  curve: Spline,
  narrow: ChevronsRightLeft,
  unpaved: Mountain,
  lanes: Columns3,
  'lane-change': ArrowRightLeft,
  highway: Road,
  smile: FaceSlightlySmiling,
  meh: FaceNeutral,
  frown: FaceSlightlyFrowning,
  sparkles: Sparkles,
} as const satisfies Record<string, LucideIcon>;

type CustomName = 'traffic-light' | 'roundabout';

export type IconName = keyof typeof LUCIDE | CustomName;

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/** 직접 그린 아이콘 (24x24 격자, lucide 와 같은 선 굵기) */
function CustomIcon({ name, size, color, strokeWidth }: Required<IconProps>) {
  const common = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'traffic-light' ? (
        <G {...common}>
          <Rect x="7.5" y="2" width="9" height="20" rx="3" />
          <Circle cx="12" cy="7" r="1.1" fill={color} />
          <Circle cx="12" cy="12" r="1.1" fill={color} />
          <Circle cx="12" cy="17" r="1.1" fill={color} />
        </G>
      ) : (
        <G {...common}>
          <Circle cx="11" cy="12" r="5" />
          <Path d="M11 17v5" />
          <Path d="M16 8l4-4" />
          <Path d="M15.5 4H20v4.5" />
        </G>
      )}
    </Svg>
  );
}

/** 장식용 아이콘. 의미는 옆의 글자나 부모의 accessibilityLabel 이 전달한다. */
export const Icon = memo(function Icon({ name, size = 24, color = colors.text, strokeWidth = 2 }: IconProps) {
  if (name === 'traffic-light' || name === 'roundabout') {
    return <CustomIcon name={name} size={size} color={color} strokeWidth={strokeWidth} />;
  }
  const Cmp = LUCIDE[name];
  return <Cmp size={size} color={color} strokeWidth={strokeWidth} />;
});
