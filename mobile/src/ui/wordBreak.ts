import type { ReactNode } from 'react';

/**
 * Android 한글 줄바꿈.
 * 기본 줄바꿈 규칙은 한글 글자 사이 어디서든 줄을 바꿀 수 있게 두어, 단어 중간에서 줄이 바뀐다 ("남│겨요").
 * Android 의 Text 에는 이를 막는 속성이 없어서, 한글이 든 어절의 글자 사이에 WORD JOINER 를 끼운다.
 * WORD JOINER(U+2060)는 폭이 없고 그 자리에서 줄이 바뀌지 않게 하는 문자라서, 줄은 공백에서만 바뀐다.
 * 어절 하나가 한 줄보다 길면 어쩔 수 없이 글자 사이에서 끊긴다.
 */
export const WORD_JOINER = '⁠';

/** 완성형 한글 음절과 호환 자모. 겹받침 등을 만드는 결합 자모(U+1100~11FF)는 글자 사이를 가르면 깨지므로 제외한다. */
const HANGUL = /[㄰-㆏가-힣]/;
const COMBINING_JAMO = /[ᄀ-ᇿ]/;

/** 공백으로 나뉜 덩어리마다 한글이 들어 있으면 글자 사이에 WORD JOINER 를 끼운다. 공백과 줄바꿈은 그대로 둔다. */
export function keepWords(text: string): string {
  return text.replace(/\S+/g, (word) =>
    HANGUL.test(word) && !COMBINING_JAMO.test(word) ? Array.from(word).join(WORD_JOINER) : word,
  );
}

/**
 * 자식이 글자(또는 숫자)뿐이면 이어 붙인 원문을, 다른 요소가 섞여 있으면 undefined 를 돌려준다.
 * 스크린 리더가 WORD JOINER 를 읽지 않도록 접근성 라벨에 이 원문을 쓴다.
 */
export function plainText(children: ReactNode): string | undefined {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (!Array.isArray(children)) return undefined;
  let out = '';
  for (const child of children) {
    if (typeof child === 'string') out += child;
    else if (typeof child === 'number') out += String(child);
    else if (child === null || child === undefined || typeof child === 'boolean') continue;
    else return undefined;
  }
  return out;
}
