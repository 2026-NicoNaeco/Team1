import { colors, mapColors } from '../design/tokens';

/**
 * WebView 안에서 도는 카카오 지도 페이지.
 * RN → 페이지: window.__applyScene(scene) (kakaoScene.ts 의 KakaoScene)
 * 페이지 → RN: { type: 'ready' } / { type: 'error', message } / { type: 'routePress', id }
 * 카카오는 JavaScript 키를 쓰는 페이지의 도메인을 검사하므로, WebView 는 이 HTML 을 baseUrl(KAKAO_PAGE_ORIGIN)로 띄우고
 * 카카오디벨로퍼스의 'JavaScript SDK 도메인'에 같은 주소를 등록해 둔다.
 */
export const KAKAO_PAGE_ORIGIN = 'http://localhost';

const THEME = {
  routeSelected: mapColors.routeSelected,
  routeSelectedCasing: mapColors.routeSelectedCasing,
  routeAlt: mapColors.routeAlt,
  routeAltCasing: mapColors.routeAltCasing,
  traveled: mapColors.traveled,
  vehicle: mapColors.vehicle,
  origin: mapColors.origin,
  destination: mapColors.destination,
  surface: colors.surface,
  border: colors.border,
  text: colors.text,
  primary: colors.primary,
  onPrimary: colors.onPrimary,
};

// 페이지 스크립트. RN 의 템플릿 문자열 안에 들어가므로 백틱과 ${ } 를 쓰지 않는다
const PAGE_SCRIPT = String.raw`
var map = null;
var routeLayers = {};
var markerLayers = {};
var lastBoundsSig = null;
var lastScene = null;
var FIT_PADDING = 28;
var CHECK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="' + THEME.onPrimary + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

function post(msg) {
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
}
window.onerror = function (message) { post({ type: 'error', message: String(message) }); };

function ll(p) { return new kakao.maps.LatLng(p[0], p[1]); }

function init() {
  if (!window.kakao || !kakao.maps) { post({ type: 'error', message: 'kakao sdk missing' }); return; }
  kakao.maps.load(function () {
    map = new kakao.maps.Map(document.getElementById('map'), { center: new kakao.maps.LatLng(35.1595, 126.8526), level: 5 });
    window.addEventListener('resize', function () {
      map.relayout();
      lastBoundsSig = null;
      if (lastScene) applyCamera(lastScene);
    });
    post({ type: 'ready' });
  });
}

function polyline(path, color, weight, zIndex) {
  return new kakao.maps.Polyline({ map: map, path: path.map(ll), strokeColor: color, strokeWeight: weight, strokeOpacity: 1, strokeStyle: 'solid', zIndex: zIndex });
}

function chipElement(route) {
  var el = document.createElement('button');
  el.className = 'chip' + (route.selected ? ' selected' : '');
  el.setAttribute('role', 'radio');
  el.setAttribute('aria-checked', route.selected ? 'true' : 'false');
  if (route.selected) el.insertAdjacentHTML('beforeend', CHECK_SVG);
  var label = document.createElement('span');
  label.textContent = route.chipText;
  el.appendChild(label);
  el.addEventListener('click', function () { post({ type: 'routePress', id: route.id }); });
  return el;
}

function applyRoutes(routes) {
  var seen = {};
  routes.forEach(function (r) {
    seen[r.id] = true;
    var width = r.selected ? 7 : 5;
    var z = r.selected ? 2 : 1;
    var full = r.traveled.concat(r.rest);
    var layer = routeLayers[r.id];
    if (!layer) {
      layer = routeLayers[r.id] = {
        casing: polyline(full, r.selected ? THEME.routeSelectedCasing : THEME.routeAltCasing, width + 4, z),
        traveled: polyline(r.traveled, THEME.traveled, width, z),
        rest: polyline(r.rest, r.selected ? THEME.routeSelected : THEME.routeAlt, width, z),
        chip: null,
        chipKey: null,
      };
    } else {
      layer.casing.setPath(full.map(ll));
      layer.traveled.setPath(r.traveled.map(ll));
      layer.rest.setPath(r.rest.map(ll));
      layer.casing.setOptions({ strokeColor: r.selected ? THEME.routeSelectedCasing : THEME.routeAltCasing, strokeWeight: width + 4, zIndex: z });
      layer.traveled.setOptions({ strokeWeight: width, zIndex: z });
      layer.rest.setOptions({ strokeColor: r.selected ? THEME.routeSelected : THEME.routeAlt, strokeWeight: width, zIndex: z });
    }
    var chipKey = r.chip ? [r.chip[0], r.chip[1], r.chipText, r.selected].join('|') : null;
    if (chipKey !== layer.chipKey) {
      if (layer.chip) layer.chip.setMap(null);
      layer.chip = r.chip
        ? new kakao.maps.CustomOverlay({ map: map, position: ll(r.chip), content: chipElement(r), xAnchor: 0.5, yAnchor: 0.5, zIndex: r.selected ? 6 : 5, clickable: true })
        : null;
      layer.chipKey = chipKey;
    }
  });
  Object.keys(routeLayers).forEach(function (id) {
    if (seen[id]) return;
    var layer = routeLayers[id];
    layer.casing.setMap(null);
    layer.traveled.setMap(null);
    layer.rest.setMap(null);
    if (layer.chip) layer.chip.setMap(null);
    delete routeLayers[id];
  });
}

function markerElement(kind) {
  var el = document.createElement('div');
  el.className = 'marker';
  if (kind === 'vehicle') {
    el.innerHTML = '<svg width="34" height="34" viewBox="-17 -17 34 34"><circle r="16" fill="' + THEME.surface + '"/><circle r="13" fill="' + THEME.vehicle + '"/><path d="M0 -7 L6 6 L0 3 L-6 6 Z" fill="' + THEME.onPrimary + '"/></svg>';
  } else if (kind === 'destination') {
    el.innerHTML = '<svg width="26" height="38" viewBox="-13 -36 26 38"><path d="M0 0 C-9 -13 -11 -18 -11 -23 A11 11 0 1 1 11 -23 C11 -18 9 -13 0 0 Z" fill="' + THEME.destination + '" stroke="' + THEME.surface + '" stroke-width="2"/><circle cy="-23" r="4" fill="' + THEME.surface + '"/></svg>';
  } else {
    el.innerHTML = '<svg width="26" height="26" viewBox="-13 -13 26 26"><circle r="9" fill="' + THEME.surface + '" stroke="' + THEME.origin + '" stroke-width="5"/></svg>';
  }
  return el;
}

function applyMarkers(markers) {
  var seen = {};
  markers.forEach(function (m) {
    seen[m.id] = true;
    var layer = markerLayers[m.id];
    if (!layer || layer.kind !== m.kind) {
      if (layer) layer.overlay.setMap(null);
      var el = markerElement(m.kind);
      layer = markerLayers[m.id] = {
        kind: m.kind,
        el: el,
        overlay: new kakao.maps.CustomOverlay({
          map: map,
          position: ll(m.point),
          content: el,
          xAnchor: 0.5,
          // 목적지 핀은 끝이 그 지점을 가리키게 한다
          yAnchor: m.kind === 'destination' ? 36 / 38 : 0.5,
          zIndex: m.kind === 'vehicle' ? 4 : 3,
        }),
      };
    } else {
      layer.overlay.setPosition(ll(m.point));
    }
    if (m.kind === 'vehicle') layer.el.style.transform = 'rotate(' + m.headingDeg + 'deg)';
  });
  Object.keys(markerLayers).forEach(function (id) {
    if (seen[id]) return;
    markerLayers[id].overlay.setMap(null);
    delete markerLayers[id];
  });
}

// 가려지지 않은 영역(insets 안쪽)의 가운데에 점을 둔다
function centerInVisible(point, insets) {
  var el = document.getElementById('map');
  var w = el.clientWidth;
  var h = el.clientHeight;
  map.setCenter(ll(point));
  var dx = (insets.right - insets.left) / 2;
  var dy = (insets.bottom - insets.top) / 2;
  if (dx === 0 && dy === 0) return;
  var center = map.getProjection().coordsFromContainerPoint(new kakao.maps.Point(w / 2 + dx, h / 2 + dy));
  map.setCenter(center);
}

function applyCamera(scene) {
  var cam = scene.camera;
  var insets = scene.insets;
  if (cam.type === 'follow') {
    if (map.getLevel() !== cam.level) map.setLevel(cam.level);
    centerInVisible(cam.point, insets);
    return;
  }
  if (cam.sig === lastBoundsSig || cam.points.length === 0) return;
  lastBoundsSig = cam.sig;
  if (cam.points.length === 1) {
    map.setLevel(4);
    centerInVisible(cam.points[0], insets);
    return;
  }
  var bounds = new kakao.maps.LatLngBounds();
  cam.points.forEach(function (p) { bounds.extend(ll(p)); });
  map.setBounds(bounds, insets.top + FIT_PADDING, insets.right + FIT_PADDING, insets.bottom + FIT_PADDING, insets.left + FIT_PADDING);
}

window.__applyScene = function (scene) {
  if (!map) return;
  lastScene = scene;
  map.setDraggable(scene.interactive);
  map.setZoomable(scene.interactive);
  applyRoutes(scene.routes);
  applyMarkers(scene.markers);
  applyCamera(scene);
};
`;

const PAGE_STYLE = `
html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: ${mapColors.land}; }
body { -webkit-tap-highlight-color: transparent; -webkit-user-select: none; user-select: none; }
.chip {
  display: inline-flex; align-items: center; gap: 4px; min-height: 34px; padding: 4px 12px;
  border-radius: 999px; border: 1px solid ${colors.border}; background: ${colors.surface}; color: ${colors.text};
  font: 600 13px/1.25 -apple-system, system-ui, 'Noto Sans KR', sans-serif; white-space: nowrap; word-break: keep-all;
  box-shadow: 0 3px 14px rgba(11, 26, 32, 0.14); cursor: pointer;
}
.chip.selected { background: ${colors.primary}; border-color: ${colors.primary}; color: ${colors.onPrimary}; }
.marker { line-height: 0; }
`;

export function buildKakaoMapHtml(appKey: string): string {
  const sdk = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false`;
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>${PAGE_STYLE}</style>
</head>
<body>
<div id="map"></div>
<script>var THEME = ${JSON.stringify(THEME)};${PAGE_SCRIPT}</script>
<script src="${sdk}" onload="init()" onerror="post({ type: 'error', message: 'kakao sdk load failed' })"></script>
</body>
</html>`;
}
