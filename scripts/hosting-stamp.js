/**
 * Helpers for the Hosting HTML stamp.
 * /_expo assets are cached as immutable for a year. Rewriting APP_BUILD_ID
 * inside an already-hashed filename leaves phones on the old bundle, which
 * then reloads forever against the new build.json. A new query string is a
 * new browser cache key.
 */

function bustExpoAssetUrls(html, buildId) {
  const v = encodeURIComponent(String(buildId));
  return html.replace(
    /(\s(?:src|href)=["'])(\/_expo\/[^"'?]+)(?:\?[^"']*)?(["'])/g,
    `$1$2?v=${v}$3`,
  );
}

function buildRefreshScript(nextId) {
  const id = JSON.stringify(nextId);
  return `<script data-protop-build-refresh>(function(){var id=${id};var k='protop_html_build';var once='protop_build_reload_once';function reloadOnce(){try{if(sessionStorage.getItem(once)==='1')return;sessionStorage.setItem(once,'1');}catch(e){return;}location.reload();}try{var p=localStorage.getItem(k);localStorage.setItem(k,id);if(p&&p!==id){reloadOnce();return;}}catch(e){}if(/^(localhost|127\\.0\\.0\\.1)$/.test(location.hostname))return;fetch('/build.json',{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(j){if(j&&j.id&&j.id!==id)reloadOnce();}).catch(function(){})})();</script>`;
}

module.exports = { bustExpoAssetUrls, buildRefreshScript };
