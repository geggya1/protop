import assert from 'node:assert/strict';
import { downsampleRoutePoints, routeMapDocument } from './routeMapHtml.js';

{
  const short = downsampleRoutePoints([
    { lat: 58.85, lng: 5.74 },
    { lat: 58.86, lng: 5.75 },
  ]);
  assert.equal(short.length, 2);
}

{
  const long = Array.from({ length: 500 }, (_, i) => ({ lat: 58 + i * 0.001, lng: 5 + i * 0.001 }));
  const cut = downsampleRoutePoints(long, 100);
  assert.equal(cut.length, 100);
  assert.equal(cut[0].lat, 58);
  assert.ok(Math.abs(cut[99].lat - long[499].lat) < 0.0001);
}

{
  const html = routeMapDocument({
    from: { lat: 58.852, lng: 5.735, label: 'Svanholmen 7' },
    to: { lat: 58.851, lng: 5.736, label: 'KinoKino' },
    points: [
      { lat: 58.852, lng: 5.735 },
      { lat: 58.8515, lng: 5.7355 },
      { lat: 58.851, lng: 5.736 },
    ],
    brand: '#3D6B8A',
  });
  assert.match(html, /leaflet@1\.9\.4/);
  assert.match(html, /OpenStreetMap/);
  assert.match(html, /L\.polyline/);
  assert.match(html, /Svanholmen 7/);
  assert.match(html, /KinoKino/);
  assert.equal(routeMapDocument({}), '');
}

console.log('routeMapHtml.test.mjs: ok');
