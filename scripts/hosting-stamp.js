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

/**
 * Selvreparasjon for /_expo-filer. Firebase svarer med index.html (200, text/html) for en
 * /_expo-adresse som ikke finnes, og firebase.json merker alt under /_expo som immutable i ett
 * år. Spør nettleseren etter de nye filene i det øyeblikket en deploy bytter versjon, lagrer den
 * HTML som JS og blir stående med blank side («MIME type text/html is not executable»).
 * Feiler et /_expo-skript eller -stilark, hentes alle /_expo-filene på siden på nytt rett fra
 * serveren (cache: 'reload' skriver over det lagrede svaret), og siden lastes på nytt.
 * Bare én gang per versjon, så en fil som faktisk mangler, ikke gir en løkke.
 * Må stå før appens skript (i <head>), så lytteren er på plass når de lastes.
 */
function assetHealScript(id) {
  return `window.addEventListener('error',function(e){var t=e&&e.target;if(!t||(t.tagName!=='SCRIPT'&&t.tagName!=='LINK'))return;var u=t.src||t.href||'';if(u.indexOf('/_expo/')<0)return;var hk='protop_asset_heal';try{if(sessionStorage.getItem(hk)===${id})return;sessionStorage.setItem(hk,${id});}catch(x){return;}var urls=[].map.call(document.querySelectorAll('script[src*="/_expo/"],link[href*="/_expo/"]'),function(n){return n.src||n.href;});Promise.all(urls.map(function(x){return fetch(x,{cache:'reload',credentials:'same-origin'}).catch(function(){});})).then(function(){location.reload();});},true);`;
}

function buildRefreshScript(nextId) {
  const id = JSON.stringify(nextId);
  return `<script data-protop-build-refresh>${assetHealScript(id)}(function(){var id=${id};var k='protop_html_build';var tried='protop_build_reload_target';function reloadOnce(target){try{if(!target||sessionStorage.getItem(tried)===target)return;sessionStorage.setItem(tried,target);}catch(e){return;}location.reload();}try{var p=localStorage.getItem(k);localStorage.setItem(k,id);if(p&&p!==id){reloadOnce(id);return;}}catch(e){}if(/^(localhost|127\\.0\\.0\\.1)$/.test(location.hostname))return;fetch('/build.json',{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(j){if(j&&j.id&&j.id!==id)reloadOnce(j.id);}).catch(function(){})})();</script>`;
}

module.exports = { bustExpoAssetUrls, buildRefreshScript };
