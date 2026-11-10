// Static pages people can find in search: one per neighbourhood (/london/soho), one per
// city (/london), and an index of everything (/neighbourhoods). Cities where English isn't
// the local language also get local-language pages (/es/madrid/malasana), linked to their
// English twin with hreflang. Built from the same venue snapshots the planner uses, so run
// it after `npm run data`, then deploy.
//
//   npm run pages
//
// Each neighbourhood page says what's there (counts by type), lists well-known places
// (own Wikipedia/Wikidata entry or a listed building, from OpenStreetMap), links the
// ready-made nights straight into the planner, and points to nearby neighbourhoods.

import { readFile, writeFile, mkdir, rm, access } from 'node:fs/promises';
import '../public/i18n.js';                       // globalThis.I18N: type and preset names

const SITE = 'https://getowlabout.com';
const RADIUS_M = 1100;                       // same walking radius as the planner
const LOCAL_LANG = { paris:'fr', madrid:'es', barcelona:'es', rome:'it', lisbon:'pt' };
const LOCALE = { en:'en-GB', fr:'fr-FR', es:'es-ES', it:'it-IT', pt:'pt-BR' };
const pub = new URL('../public/', import.meta.url);
const read = async p => JSON.parse(await readFile(new URL(p, pub), 'utf8'));
const exists = p => access(new URL(p, pub)).then(() => true, () => false);

const areas = await read('data/areas.json');
const cities = await read('data/cities.json');
const html = await readFile(new URL('index.html', pub), 'utf8');

// The ready-made nights live in index.html; read them from there so the two never drift.
const presetSrc = html.match(/const PRESETS = (\[[\s\S]*?\n  \]);/);
if (!presetSrc) throw new Error('Could not find PRESETS in index.html');
const PRESETS = Function('"use strict"; return ' + presetSrc[1])();

const TYPE_IDS = ['pub', 'cocktail', 'wine', 'rooftop', 'dinner', 'cheap', 'live', 'comedy', 'games', 'karaoke', 'dance', 'latefood'];
// List pages: /london/soho/pubs. Same English slugs in every language (the folder prefix carries the language).
const TYPE_SLUG = { pub:'pubs', cocktail:'cocktail-bars', wine:'wine-bars', rooftop:'drinks-outside', dinner:'dinner', cheap:'cheap-eats',
  live:'live-music', comedy:'comedy', games:'bar-games', karaoke:'karaoke', dance:'clubs', latefood:'late-night-food' };
const REPEATS = new Set(['pub', 'cocktail', 'wine', 'rooftop']);         // fine to do three of in one night

// Page copy. Type names and presets come from the app's i18n.js; these are only for pages.
const PAGE = {
  en: {
    typeH1:'{types} in {area}', typeLede:'All {n} {types} within a short walk of the middle of {area}. Well-known places first, then A to Z.', search:'Search by name', map:'Map', website:'Website', planWith:'Plan a night in {area}', back:'Back to {area}', noMatch:'Nothing matches', knownBadge:'Well known', seeAll:'Tap a number to see every place.',
    plural: { pub:'pubs', cocktail:'cocktail bars', wine:'wine bars', rooftop:'places to drink outside', dinner:'places for dinner', cheap:'cheap eats',
      live:'live music venues', comedy:'comedy venues', games:'bars with games', karaoke:'karaoke spots', dance:'clubs', latefood:'late-night food spots' },
    and:'and', h1:'A night out in {area}',
    lede:'Within a short walk of the middle of {area} there are {list}. Owlabout turns that into a plan: a few stops in walking order, timed for the evening, with one link to send the group.',
    cta:'Plan a night in {area}', here:'What’s here', ready:'Ready-made nights in {area}', known:'Well-known places in {area}',
    knownP:'Places here with their own Wikipedia entry or a listed building. Plans favour them a little, alongside newer spots.',
    near:'Near {area}', km:'{km} km away', all:'All neighbourhoods',
    title:'Night out in {where}: bars, dinner and a walkable plan · Owlabout',
    desc:'Plan a night out in {where}. {list}, turned into a timed, walkable plan to send to your group.',
    cityH1:'A night out in {city}', cityP:'{n} neighbourhoods. Pick one to see what’s there, or go straight to a plan.', cityHoods:'Neighbourhoods',
    cityTitle:'Night out in {city}: {n} neighbourhoods, planned for you · Owlabout',
    cityDesc:'Plan a night out in {city}. {n} neighbourhoods, each turned into a timed, walkable plan to send to your group.',
    footer:'Places change: check before you go.', privacy:'Privacy', terms:'Terms',
  },
  fr: {
    typeH1:'{types} à {area}', typeLede:'Les {n} {types} à quelques minutes à pied du centre de {area}. Les lieux connus d’abord, puis de A à Z.', search:'Chercher par nom', map:'Carte', website:'Site web', planWith:'Planifier une soirée à {area}', back:'Retour à {area}', noMatch:'Aucun résultat', knownBadge:'Lieu connu', seeAll:'Touchez un nombre pour voir tous les lieux.',
    plural: { pub:'pubs', cocktail:'bars à cocktails', wine:'bars à vin', rooftop:'terrasses', dinner:'restaurants', cheap:'adresses petits prix',
      live:'salles de concert', comedy:'scènes de stand-up', games:'bars à jeux', karaoke:'karaokés', dance:'clubs', latefood:'adresses pour manger tard' },
    and:'et', h1:'Une soirée à {area}',
    lede:'À quelques minutes à pied du centre de {area}, il y a {list}. Owlabout en fait une soirée : quelques étapes dans l’ordre du trajet, minutées, avec un seul lien à envoyer au groupe.',
    cta:'Planifier une soirée à {area}', here:'Ce qu’il y a', ready:'Soirées toutes prêtes à {area}', known:'Lieux connus à {area}',
    knownP:'Des lieux qui ont leur propre page Wikipédia ou occupent un bâtiment classé. Les soirées les privilégient un peu, à côté d’adresses plus récentes.',
    near:'Près de {area}', km:'à {km} km', all:'Tous les quartiers',
    title:'Sortir à {where} : bars, dîner et une soirée à pied · Owlabout',
    desc:'Planifiez une soirée à {where}. {list}, en une soirée minutée à faire à pied, à envoyer à votre groupe.',
    cityH1:'Une soirée à {city}', cityP:'{n} quartiers. Choisissez-en un pour voir ce qu’il y a, ou passez directement à la soirée.', cityHoods:'Quartiers',
    cityTitle:'Sortir à {city} : {n} quartiers, une soirée toute prête · Owlabout',
    cityDesc:'Planifiez une soirée à {city}. {n} quartiers, chacun en une soirée minutée à faire à pied, à envoyer à votre groupe.',
    footer:'Les lieux changent : vérifiez avant d’y aller.', privacy:'Confidentialité', terms:'Conditions',
  },
  es: {
    typeH1:'{types} en {area}', typeLede:'Los {n} {types} a un paseo del centro de {area}. Primero los sitios conocidos y luego de la A a la Z.', search:'Buscar por nombre', map:'Mapa', website:'Web', planWith:'Planear una noche en {area}', back:'Volver a {area}', noMatch:'No hay resultados', knownBadge:'Conocido', seeAll:'Toca un número para ver todos los sitios.',
    plural: { pub:'pubs', cocktail:'coctelerías', wine:'bares de vinos', rooftop:'terrazas', dinner:'restaurantes', cheap:'sitios baratos',
      live:'salas con música en directo', comedy:'locales de comedia', games:'bares con juegos', karaoke:'karaokes', dance:'discotecas', latefood:'sitios para comer de madrugada' },
    and:'y', h1:'Una noche en {area}',
    lede:'A un paseo del centro de {area} hay {list}. Owlabout lo convierte en un plan: unas pocas paradas en orden, con horario, y un solo enlace para enviar al grupo.',
    cta:'Planear una noche en {area}', here:'Qué hay', ready:'Noches listas en {area}', known:'Sitios conocidos en {area}',
    knownP:'Sitios con su propia entrada en Wikipedia o en un edificio protegido. Los planes los prefieren un poco, junto a sitios más nuevos.',
    near:'Cerca de {area}', km:'a {km} km', all:'Todos los barrios',
    title:'Salir por {where}: bares, cena y un plan a pie · Owlabout',
    desc:'Planea una noche en {where}. {list}, convertidos en un plan con horario y a pie para enviar a tu grupo.',
    cityH1:'Una noche en {city}', cityP:'{n} barrios. Elige uno para ver qué hay o ve directo a un plan.', cityHoods:'Barrios',
    cityTitle:'Salir por {city}: {n} barrios, planes hechos para ti · Owlabout',
    cityDesc:'Planea una noche en {city}. {n} barrios, cada uno convertido en un plan con horario y a pie para enviar a tu grupo.',
    footer:'Los sitios cambian: compruébalo antes de ir.', privacy:'Privacidad', terms:'Condiciones',
  },
  it: {
    typeH1:'{types} a {area}', typeLede:'Tutti i {n} {types} a pochi passi dal centro di {area}. Prima i posti noti, poi dalla A alla Z.', search:'Cerca per nome', map:'Mappa', website:'Sito web', planWith:'Organizza una serata a {area}', back:'Torna a {area}', noMatch:'Nessun risultato', knownBadge:'Posto noto', seeAll:'Tocca un numero per vedere tutti i posti.',
    plural: { pub:'pub', cocktail:'cocktail bar', wine:'enoteche', rooftop:'posti per bere all’aperto', dinner:'ristoranti', cheap:'posti economici',
      live:'locali con musica dal vivo', comedy:'locali comedy', games:'bar con giochi', karaoke:'karaoke', dance:'discoteche', latefood:'posti per mangiare a tarda notte' },
    and:'e', h1:'Una serata a {area}',
    lede:'A pochi passi dal centro di {area} ci sono {list}. Owlabout li trasforma in un piano: qualche tappa in ordine di percorso, a orari, con un solo link da mandare al gruppo.',
    cta:'Organizza una serata a {area}', here:'Cosa c’è', ready:'Serate pronte a {area}', known:'Posti noti a {area}',
    knownP:'Posti con una propria pagina Wikipedia o in un edificio storico. I piani li preferiscono un po’, insieme a locali più nuovi.',
    near:'Vicino a {area}', km:'a {km} km', all:'Tutti i quartieri',
    title:'Uscire a {where}: bar, cena e una serata a piedi · Owlabout',
    desc:'Organizza una serata a {where}. {list}, trasformati in un piano a orari da fare a piedi, da mandare al tuo gruppo.',
    cityH1:'Una serata a {city}', cityP:'{n} quartieri. Scegline uno per vedere cosa c’è, o vai subito a un piano.', cityHoods:'Quartieri',
    cityTitle:'Uscire a {city}: {n} quartieri, serate già pronte · Owlabout',
    cityDesc:'Organizza una serata a {city}. {n} quartieri, ognuno trasformato in un piano a orari da fare a piedi, da mandare al tuo gruppo.',
    footer:'I locali cambiano: controlla prima di andare.', privacy:'Privacy', terms:'Condizioni',
  },
  pt: {
    typeH1:'{types} em {area}', typeLede:'Todos os {n} {types} a uma caminhada do centro de {area}. Primeiro os lugares conhecidos, depois de A a Z.', search:'Buscar pelo nome', map:'Mapa', website:'Site', planWith:'Planejar uma noite em {area}', back:'Voltar para {area}', noMatch:'Nada encontrado', knownBadge:'Conhecido', seeAll:'Toque num número para ver todos os lugares.',
    plural: { pub:'pubs', cocktail:'bares de drinks', wine:'bares de vinhos', rooftop:'lugares ao ar livre', dinner:'restaurantes', cheap:'lugares baratos',
      live:'casas de show', comedy:'casas de comédia', games:'bares com jogos', karaoke:'karaokês', dance:'baladas', latefood:'lugares para comer de madrugada' },
    and:'e', h1:'Uma noite em {area}',
    lede:'A uma caminhada do centro de {area} há {list}. O Owlabout transforma isso num plano: algumas paradas na ordem do caminho, com horários, e um link só para mandar pro grupo.',
    cta:'Planejar uma noite em {area}', here:'O que tem', ready:'Noites prontas em {area}', known:'Lugares conhecidos em {area}',
    knownP:'Lugares com página própria na Wikipédia ou em prédio tombado. Os planos dão um pouco de preferência a eles, junto com lugares mais novos.',
    near:'Perto de {area}', km:'a {km} km', all:'Todos os bairros',
    title:'Sair em {where}: bares, jantar e um plano a pé · Owlabout',
    desc:'Planeje uma noite em {where}. {list}, num plano com horários e a pé para mandar pro seu grupo.',
    cityH1:'Uma noite em {city}', cityP:'{n} bairros. Escolha um para ver o que tem ou vá direto para um plano.', cityHoods:'Bairros',
    cityTitle:'Sair em {city}: {n} bairros, planos prontos para você · Owlabout',
    cityDesc:'Planeje uma noite em {city}. {n} bairros, cada um num plano com horários e a pé para mandar pro seu grupo.',
    footer:'Os lugares mudam: confira antes de ir.', privacy:'Privacidade', terms:'Termos',
  },
};
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m);
const tr = (lang, key) => I18N[lang][key] ?? I18N.en[key];

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/&/g, ' and ').replace(/[’'()]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function distM(a, b){
  const r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}
const cityOf = a => cities.find(c => c.id === (a.city || 'london'));
const cityName = (c, lang) => (c.names && c.names[lang]) || c.name;
const prefix = lang => lang === 'en' ? '' : '/' + lang;
const areaUrl = (a, lang) => prefix(lang) + '/' + cityOf(a).id + '/' + slug(a.name);
const cityUrl = (c, lang) => prefix(lang) + '/' + c.id;
const langsFor = c => LOCAL_LANG[c.id] ? ['en', LOCAL_LANG[c.id]] : ['en'];
const listJoin = (xs, lang) => xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' ' + PAGE[lang].and + ' ' + xs[xs.length - 1];
const appLink = (params, lang) => '/#' + new URLSearchParams({ ...params, ...(lang === 'en' ? {} : { l:lang }) }).toString();
const presetLink = (a, p, lang) => appLink({ a:a.id, t:p.types.join(','), n:p.n, s:p.start, e:p.end, x:p.name }, lang);

const STYLE = `
  :root{ --bg:#161513; --card:#1e1d1a; --text:#efe9de; --text-2:#aaa398; --muted:#7d776d; --line:#2c2a26; --line-2:#3d3a35; --route:#f5c84b; --red:#ff4d3d; --display:"Barlow Condensed",sans-serif; }
  *{ box-sizing:border-box; }
  body{ margin:0; background:var(--bg); color:var(--text); font:400 16px/26px Inter,system-ui,sans-serif; }
  a{ color:var(--route); }
  .top{ display:flex; align-items:center; justify-content:space-between; gap:12px; height:64px; padding:0 16px; border-bottom:1px solid var(--line); }
  .logo{ display:flex; align-items:center; gap:8px; font:600 22px/1 var(--display); color:var(--text); text-decoration:none; }
  .logo img{ width:28px; height:28px; }
  .top nav{ display:flex; gap:12px; font-size:14px; }
  main{ max-width:48rem; margin:0 auto; padding:32px 16px 64px; }
  .crumbs{ font-size:14px; color:var(--text-2); margin:0 0 16px; }
  .crumbs a{ color:var(--text-2); }
  h1{ font:600 48px/1 var(--display); margin:0 0 16px; }
  h2{ font:600 28px/1.1 var(--display); margin:40px 0 12px; }
  h3{ font:600 20px/1.2 var(--display); margin:20px 0 6px; }
  p, li{ color:var(--text-2); }
  .cta{ display:inline-block; margin:8px 0 0; padding:14px 22px; border-radius:999px; background:var(--route); color:#1a1508; font-weight:600; text-decoration:none; }
  .grid{ display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:12px; padding:0; list-style:none; }
  .grid li{ background:var(--card); border:1px solid var(--line); border-radius:14px; padding:14px 16px; }
  .grid li a{ font:600 20px/1.2 var(--display); text-decoration:none; color:var(--text); }
  .grid li span{ display:block; font-size:14px; color:var(--text-2); margin-top:4px; }
  ul.places{ padding-left:20px; margin:0; }
  .counts{ display:flex; flex-wrap:wrap; gap:8px; padding:0; list-style:none; }
  .counts li a{ display:inline-flex; align-items:center; min-height:40px; border:1px solid var(--line-2); border-radius:999px; padding:0 14px; font-size:14px;
    color:var(--text); text-decoration:none; background:var(--card); }
  .counts li a:hover{ border-color:var(--route); }
  .counts li a b{ color:var(--route); font-weight:600; margin-left:6px; }
  .hint{ font-size:14px; color:var(--muted); margin:0 0 12px; }
  .search{ width:100%; height:48px; padding:0 14px; margin:8px 0 16px; border:1px solid var(--line-2); border-radius:12px; background:var(--card); color:var(--text); font:inherit; font-size:16px; }
  ul.venues{ list-style:none; padding:0; margin:0; }
  ul.venues li{ padding:14px 0; border-top:1px solid var(--line); }
  ul.venues h3{ margin:0 0 2px; font:600 22px/1.2 var(--display); color:var(--text); }
  ul.venues .meta{ margin:0; font-size:14px; color:var(--text-2); }
  ul.venues .hours{ margin:2px 0 0; font-size:13px; color:var(--muted); }
  ul.venues .badge{ display:inline-block; margin-left:8px; padding:2px 8px; border-radius:999px; font:500 12px/1.4 Inter,sans-serif; color:var(--route); border:1px solid var(--route); vertical-align:middle; }
  ul.venues .links{ display:flex; gap:16px; margin-top:6px; font-size:14px; }
  ul.venues .links a{ display:inline-flex; align-items:center; min-height:32px; }
  .back-link{ display:inline-flex; align-items:center; min-height:44px; }
  footer{ max-width:48rem; margin:0 auto; padding:0 16px 48px; font-size:13px; color:var(--muted); }
  footer a{ color:var(--text-2); }`;

// alternates: [[lang, path], …] for the same page in every language it exists in.
function page({ lang, path, title, desc, body, crumbs, alternates = [] }){
  const P = PAGE[lang];
  const other = alternates.filter(([l]) => l !== lang);
  return `<!DOCTYPE html>
<html lang="${lang === 'pt' ? 'pt-BR' : lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#161513">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${path}">
${alternates.length > 1 ? alternates.map(([l, p]) => `<link rel="alternate" hreflang="${l === 'pt' ? 'pt-BR' : l}" href="${SITE}${p}">`).join('\n') +
  `\n<link rel="alternate" hreflang="x-default" href="${SITE}${alternates.find(([l]) => l === 'en')[1]}">\n` : ''}<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:site_name" content="Owlabout">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE}${path}">
<meta property="og:image" content="${SITE}/og.png">
<meta property="og:locale" content="${LOCALE[lang].replace('-', '_')}">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>${STYLE}
</style>
</head>
<body>
<header class="top"><a class="logo" href="${appLink({}, lang)}"><img src="/icon.svg" alt="">Owlabout</a><nav>${other.map(([l, p]) =>
  `<a href="${p}" hreflang="${l}" lang="${l}">${l.toUpperCase()}</a>`).join('')}<a href="/neighbourhoods">${esc(P.all)}</a></nav></header>
<main>
${crumbs ? '<p class="crumbs">' + crumbs + '</p>' : ''}
${body}
</main>
<footer>Venue data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>, ODbL. ${esc(P.footer)} · <a href="/privacy">${esc(P.privacy)}</a> · <a href="/terms">${esc(P.terms)}</a></footer>
</body>
</html>
`;
}

async function write(path, text){
  const file = new URL('.' + path + '.html', pub);
  await mkdir(new URL('.', file), { recursive:true });
  await writeFile(file, text);
}

// Start clean so renamed or pruned areas don't leave stale pages behind.
for (const c of cities) await rm(new URL(c.id + '/', pub), { recursive:true, force:true });
for (const l of Object.keys(PAGE)) if (l !== 'en') await rm(new URL(l + '/', pub), { recursive:true, force:true });

const urls = ['/', '/neighbourhoods'];
const built = [];
let pages = 0;
for (const a of areas) {
  if (!await exists(`data/areas/${a.id}.json`)) continue;
  const venues = (await read(`data/areas/${a.id}.json`)).venues.filter(v => distM(a, v) <= RADIUS_M);
  const city = cityOf(a);
  const counts = TYPE_IDS.map(id => [id, venues.filter(v => v.vibes.includes(id)).length]).filter(c => c[1] > 0);
  const top = counts.filter(c => c[1] >= 3).sort((x, y) => y[1] - x[1]).slice(0, 4);
  const near = areas.filter(b => b.id !== a.id && (b.city || 'london') === city.id).map(b => [distM(a, b), b]).sort((x, y) => x[0] - y[0]).slice(0, 6);
  const known = TYPE_IDS.map(id => [id, venues.filter(v => v.known && v.vibes.includes(id) && v.name)
    .sort((x, y) => x.name.localeCompare(y.name)).slice(0, 6)]).filter(k => k[1].length);
  const langs = langsFor(city), alternates = langs.map(l => [l, areaUrl(a, l)]);

  for (const lang of langs) {
    const P = PAGE[lang], num = n => n.toLocaleString(LOCALE[lang]);
    const seen = new Set();
    const knownHtml = known.map(([id, vs]) => {
      const fresh = vs.filter(v => !seen.has(v.id)); fresh.forEach(v => seen.add(v.id));
      return fresh.length ? '<h3>' + esc(tr(lang, 'type.' + id)) + '</h3><ul class="places">' + fresh.map(v => '<li>' + esc(v.name) +
        (v.street ? ', ' + esc(v.street) : '') + '</li>').join('') + '</ul>' : '';
    }).join('');
    const where = a.name + ', ' + cityName(city, lang);
    const v = { area:a.name, where };
    const list = listJoin(top.map(([id, n]) => num(n) + ' ' + P.plural[id]), lang);
    const body = `<h1>${esc(fill(P.h1, v))}</h1>
<p>${esc(fill(P.lede, { ...v, list }))}</p>
<a class="cta" href="${esc(appLink({ a:a.id }, lang))}">${esc(fill(P.cta, v))}</a>

<h2>${esc(P.here)}</h2>
<p class="hint">${esc(P.seeAll)}</p>
<ul class="counts">${counts.map(([id, n]) => '<li><a href="' + areaUrl(a, lang) + '/' + TYPE_SLUG[id] + '">' + esc(tr(lang, 'type.' + id)) + '<b>' + num(n) + '</b></a></li>').join('')}</ul>

<h2>${esc(fill(P.ready, v))}</h2>
<ul class="grid">${PRESETS.map((p, i) => '<li><a href="' + esc(presetLink(a, p, lang)) + '">' + esc(tr(lang, 'preset.' + i + '.name')) + '</a><span>' +
  esc(tr(lang, 'preset.' + i + '.desc')) + '</span></li>').join('')}</ul>

${knownHtml ? `<h2>${esc(fill(P.known, v))}</h2>
<p>${esc(P.knownP)}</p>
${knownHtml}` : ''}

${near.length ? `<h2>${esc(fill(P.near, v))}</h2>
<ul class="grid">${near.map(([d, b]) => '<li><a href="' + areaUrl(b, lang) + '">' + esc(b.name) + '</a><span>' +
  esc(fill(P.km, { km:(d / 1000).toLocaleString(LOCALE[lang], { maximumFractionDigits:1 }) })) + '</span></li>').join('')}</ul>` : ''}`;
    const path = areaUrl(a, lang);
    await write(path, page({
      lang, path, body, alternates,
      title: fill(P.title, v),
      desc: fill(P.desc, { where, list:top.map(([id, n]) => num(n) + ' ' + P.plural[id]).join(', ') }),
      crumbs: `<a href="/neighbourhoods">${esc(P.all)}</a> › <a href="${cityUrl(city, lang)}">${esc(cityName(city, lang))}</a> › ${esc(a.name)}`,
    }));
    urls.push(path);
    pages++;

    for (const [id, n] of counts) {
      const list = venues.filter(x => x.vibes.includes(id) && x.name)
        .sort((x, y) => (y.known ? 1 : 0) - (x.known ? 1 : 0) || x.name.localeCompare(y.name, LOCALE[lang]));
      const types = P.plural[id], Types = types.charAt(0).toUpperCase() + types.slice(1);
      const tv = { types:Types, area:a.name, n:num(n) };
      const maps = x => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([x.name, x.street, x.postcode || cityName(city, 'en')].filter(Boolean).join(', '));
      const tpath = path + '/' + TYPE_SLUG[id];
      const tbody = `<h1>${esc(fill(P.typeH1, tv))}</h1>
<p>${esc(fill(P.typeLede, { ...tv, types }))}</p>
<a class="cta" href="${esc(appLink({ a:a.id, t:id, n:REPEATS.has(id) ? 3 : 1 }, lang))}">${esc(fill(P.planWith, v))}</a>
<input class="search" id="q" type="search" autocomplete="off" placeholder="${esc(P.search)}" aria-label="${esc(P.search)}">
<ul class="venues" id="list">${list.map(x => '<li data-name="' + esc(x.name.toLowerCase()) + '"><h3>' + esc(x.name) + (x.known ? '<span class="badge">' + esc(P.knownBadge) + '</span>' : '') + '</h3>' +
  (x.street ? '<p class="meta">' + esc(x.street) + '</p>' : '') + (x.hours ? '<p class="hours">' + esc(x.hours) + '</p>' : '') +
  '<p class="links"><a href="' + esc(maps(x)) + '" rel="noopener nofollow" target="_blank">' + esc(P.map) + '</a>' +
  (x.website && /^https?:\/\//.test(x.website) ? '<a href="' + esc(x.website) + '" rel="noopener nofollow ugc" target="_blank">' + esc(P.website) + '</a>' : '') + '</p></li>').join('')}</ul>
<p class="hint" id="none" hidden>${esc(P.noMatch)}</p>
<p><a class="back-link" href="${path}">← ${esc(fill(P.back, v))}</a></p>
<script>
  const q = document.getElementById('q'), items = [...document.querySelectorAll('#list li')], none = document.getElementById('none');
  q.addEventListener('input', () => {
    const s = q.value.trim().toLowerCase(); let shown = 0;
    for (const li of items) { const on = !s || li.dataset.name.includes(s); li.hidden = !on; if (on) shown++; }
    none.hidden = shown > 0;
  });
</script>`;
      await write(tpath, page({
        lang, path:tpath, body:tbody, alternates:langs.map(l => [l, areaUrl(a, l) + '/' + TYPE_SLUG[id]]),
        title: fill(P.typeH1, tv) + ' · Owlabout',
        desc: fill(P.typeLede, { ...tv, types }),
        crumbs: `<a href="/neighbourhoods">${esc(P.all)}</a> › <a href="${cityUrl(city, lang)}">${esc(cityName(city, lang))}</a> › <a href="${path}">${esc(a.name)}</a> › ${esc(Types)}`,
      }));
      urls.push(tpath);
      pages++;
    }
  }
  built.push(a);
}

// City pages: every built neighbourhood in that city, in each of its languages.
let cityPages = 0;
for (const c of cities) {
  const list = built.filter(a => (a.city || 'london') === c.id);
  if (!list.length) continue;
  const langs = langsFor(c), alternates = langs.map(l => [l, cityUrl(c, l)]);
  for (const lang of langs) {
    const P = PAGE[lang], v = { city:cityName(c, lang), n:list.length };
    const body = `<h1>${esc(fill(P.cityH1, v))}</h1>
<p>${esc(fill(P.cityP, v))}</p>
<a class="cta" href="${esc(appLink({ a:c.default }, lang))}">${esc(fill(P.cta, { area:cityName(c, lang) }))}</a>
<h2>${esc(P.cityHoods)}</h2>
<ul class="grid">${list.slice().sort((x, y) => x.name.localeCompare(y.name)).map(a => '<li><a href="' + areaUrl(a, lang) + '">' + esc(a.name) + '</a>' +
  (a.region ? '<span>' + esc(tr(lang, 'region.' + a.region)) + '</span>' : '') + '</li>').join('')}</ul>`;
    const path = cityUrl(c, lang);
    await write(path, page({ lang, path, body, alternates, title:fill(P.cityTitle, v), desc:fill(P.cityDesc, v),
      crumbs:`<a href="/neighbourhoods">${esc(P.all)}</a> › ${esc(cityName(c, lang))}` }));
    urls.push(path);
    cityPages++;
  }
}

// Index of everything (English; local pages are linked from each city).
const index = cities.map(c => [c, built.filter(a => (a.city || 'london') === c.id)]).filter(([, l]) => l.length);
await write('/neighbourhoods', page({ lang:'en', path:'/neighbourhoods',
  title:'Every neighbourhood on Owlabout',
  desc:`Night-out plans for ${built.length} neighbourhoods in ${index.length} cities.`,
  body:`<h1>Every neighbourhood</h1><p>${built.length} neighbourhoods in ${index.length} cities.</p>` +
    index.map(([c, l]) => `<h2><a href="/${c.id}">${esc(c.name)}</a>${LOCAL_LANG[c.id] ? ` <a href="${cityUrl(c, LOCAL_LANG[c.id])}" hreflang="${LOCAL_LANG[c.id]}" style="font-size:16px">${LOCAL_LANG[c.id].toUpperCase()}</a>` : ''}</h2><p>` +
      l.slice().sort((x, y) => x.name.localeCompare(y.name)).map(a => '<a href="' + areaUrl(a, 'en') + '">' + esc(a.name) + '</a>').join(' · ') + '</p>').join('') }));

urls.push('/privacy', '/terms');
await writeFile(new URL('sitemap.xml', pub), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map(u => '  <url><loc>' + SITE + u + '</loc></url>').join('\n') + '\n</urlset>\n');
console.log(`${built.length} neighbourhoods → ${pages} pages, ${cityPages} city pages, sitemap with ${urls.length} URLs`);
