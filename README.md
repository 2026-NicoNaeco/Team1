# 쉬운 길 지도

초보 운전자를 위해, 조금 돌아가더라도 운전 부담이 적은 길을 안내하는 서비스.

## 구조

```
backend/   경로 계산 서버 (FastAPI). 실행법·API 명세는 backend/README.md
mobile/    모바일 앱 (React Native + Expo). 실행법은 mobile/README.md
```

> `Yolo_detection.py`, `Sample.zip`, `파일구조예시` 는 이전 주제(군중 밀집 위험도 예측)의 파일이다.

## 브랜치 전략

```
main      최종 배포용. 마지막에만 develop 을 머지한다
develop   통합 브랜치. 모든 기능은 여기로 PR
<이름>    개인 작업 브랜치. develop 에서 분기
```

```bash
git switch develop && git pull           # 최신 develop 받기
git switch -c <이름>                     # 처음 한 번만 (이후엔 git switch <이름>)
git merge develop                        # 작업 전 develop 변경 반영
git push -u origin <이름>                # 푸시 후 GitHub 에서 develop 으로 PR
```
