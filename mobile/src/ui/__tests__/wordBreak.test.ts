import { createElement } from 'react';
import { keepWords, plainText, WORD_JOINER } from '../wordBreak';

const WJ = WORD_JOINER;

describe('keepWords', () => {
  it('한글 어절의 글자 사이에 WORD JOINER 를 끼우고 공백은 그대로 둔다', () => {
    expect(keepWords('남겨요 정도를')).toBe(`남${WJ}겨${WJ}요 정${WJ}도${WJ}를`);
  });

  it('원문에서 WORD JOINER 만 빼면 원래 글자와 같다', () => {
    const text = '‘쉬웠어요/어려웠어요’ 평가로 요소별 회피 정도를 조금 조정해요.';
    expect(keepWords(text).split(WJ).join('')).toBe(text);
  });

  it('줄바꿈 문자는 그대로 둔다', () => {
    const out = keepWords('조금 돌아가더라도,\n나에게 운전');
    expect(out).toContain(',\n나');
    expect(out.split(WJ).join('')).toBe('조금 돌아가더라도,\n나에게 운전');
  });

  it('숫자·영문·기호뿐인 덩어리는 건드리지 않는다', () => {
    expect(keepWords('3.3km +0.4 (A) 12:30')).toBe('3.3km +0.4 (A) 12:30');
  });

  it('한글과 숫자가 섞인 덩어리는 숫자도 떨어지지 않게 묶는다', () => {
    expect(keepWords('9개')).toBe(`9${WJ}개`);
    expect(keepWords('+10분')).toBe(`+${WJ}1${WJ}0${WJ}분`);
  });

  it('결합 자모가 든 덩어리는 글자를 가르지 않는다', () => {
    const jamo = '한'; // ᄒ + ᅡ + ᆫ (조합하면 "한")
    expect(keepWords(jamo)).toBe(jamo);
  });

  it('빈 문자열도 처리한다', () => {
    expect(keepWords('')).toBe('');
  });
});

describe('plainText', () => {
  it('문자열과 숫자는 그대로 돌려준다', () => {
    expect(plainText('안녕')).toBe('안녕');
    expect(plainText(12)).toBe('12');
  });

  it('글자·숫자로만 된 배열은 이어 붙이고 null·불리언은 건너뛴다', () => {
    expect(plainText(['예상 ', 28, '분', null, false, undefined])).toBe('예상 28분');
  });

  it('다른 요소가 섞이면 undefined', () => {
    expect(plainText(['감수할 점 ', createElement('span', null, '중첩')])).toBeUndefined();
    expect(plainText(createElement('span'))).toBeUndefined();
  });
});
