import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** 시스템의 "동작 줄이기" 설정. 켜져 있으면 시트·지도 이동 같은 애니메이션을 생략한다. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (alive) setReduced(v);
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}
