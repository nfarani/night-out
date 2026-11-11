// Cross-device QA: 10 phones/tablets/desktops on Safari (WebKit), Chrome and Firefox engines.
// Needs the app running locally (npm run dev -- --port 8788). Run: npm run qa  (or npm run qa -- iphone)
// Devices run one after another: the API allows 30 writes a minute per IP.
import { chromium, webkit, firefox, devices } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8788';
const ENGINES = { chromium, webkit, firefox };
const DEVICES = [
  ['iPhone SE (Safari)',         'webkit',   devices['iPhone SE']],
  ['iPhone 15 Pro Max (Safari)', 'webkit',   devices['iPhone 15 Pro Max']],
  ['iPad Mini (Safari)',         'webkit',   devices['iPad Mini']],
  ['Pixel 7 (Chrome)',           'chromium', devices['Pixel 7']],
  ['Galaxy S9+ (Chrome)',        'chromium', devices['Galaxy S9+']],
  ['Narrow 320 (Chrome)',        'chromium', { ...devices['Galaxy S5'], viewport:{ width:320, height:568 } }],
  ['Android Firefox-size',       'firefox',  { viewport:{ width:412, height:860 }, userAgent:undefined }],
  ['Desktop Chrome',             'chromium', devices['Desktop Chrome']],
  ['Desktop Safari',             'webkit',   devices['Desktop Safari']],
  ['Desktop Firefox',            'firefox',  devices['Desktop Firefox']],
];
const only = process.argv[2];

const wait = ms => new Promise(r => setTimeout(r, ms));
// Errors from third-party map/tile CDNs or blocked geolocation aren't ours.
const IGNORE = /openfreemap|maplibre|tiles\.|favicon|net::ERR|Failed to load resource|ResizeObserver|WebGL|webgl/i;

async function runDevice([name, engine, dev]) {
  const results = [];
  const ok = (cond, msg, extra) => results.push({ pass:!!cond, msg:msg + (cond || extra === undefined ? '' : ' → ' + extra) });
  const browser = await ENGINES[engine].launch();
  const opts = { ...dev, locale:'en-GB', timezoneId:'Europe/London' };
  if (engine === 'firefox') { delete opts.isMobile; delete opts.hasTouch && 0; }
  if (engine === 'chromium') opts.permissions = ['clipboard-read', 'clipboard-write'];
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !IGNORE.test(m.text())) errs.push('console: ' + m.text()); });
  page.on('dialog', d => { errs.push('unexpected dialog: ' + d.type() + ' ' + d.message().slice(0, 60)); d.accept(); });
  const touch = !!dev.hasTouch;
  const tap = async sel => { const l = typeof sel === 'string' ? page.locator(sel).first() : sel; await l.scrollIntoViewIfNeeded(); touch ? await l.tap() : await l.click(); };
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  const y = () => page.evaluate(() => scrollY);
  const visibleSheetFits = sel => page.evaluate(s => {
    const d = document.querySelector(s); if (!d || !d.open) return 'not open';
    const r = d.getBoundingClientRect();
    if (r.left < -1 || r.right > innerWidth + 1) return 'wider than screen (' + Math.round(r.width) + ' vs ' + innerWidth + ')';
    const btns = [...d.querySelectorAll('button')].filter(b => b.offsetParent);
    // every button reachable: inside the sheet's scroll area
    return d.scrollHeight > d.clientHeight + 1 && getComputedStyle(d).overflowY === 'visible' ? 'content cut off' : 'ok';
  }, sel);
  const textLeaks = () => page.evaluate(() => {
    // Untranslated keys show as e.g. "plan.swap"
    const t = document.body.innerText;
    return (t.match(/\b(?:plan|home|vote|toast|share|stop|times|pick|sheet|group|join|fb|report|about|nav|link|type|day|preset|region|weather|count|tag|aria|title|time|view)\.[a-zA-Z0-9.]+\b/g) || [])
      .filter(x => !/\.(com|html|org|no|js)$/.test(x));
  });

  try {
    // ---------- home ----------
    await page.goto(BASE + '/?ref=reddit');
    await page.waitForSelector('#stops-n button', { timeout:15000 });
    ok(await page.locator('#s-home.on').count(), 'home shows on load');
    ok(!/ref=/.test(page.url()), 'source tag is removed from the address', page.url());
    ok(await page.locator('#guide').isVisible(), 'first visit shows the slim "see how it works" strip');
    const stripH = (await page.locator('#guide').boundingBox()).height;
    ok(stripH <= 64, 'the strip stays slim', Math.round(stripH) + 'px');
    await tap('#guide-open'); await page.waitForSelector('#how-sheet[open]');
    ok(await visibleSheetFits('#how-sheet') === 'ok', 'how-it-works sheet fits screen', await visibleSheetFits('#how-sheet'));
    await page.waitForFunction(() => document.getElementById('how-video').currentTime > 0.3, null, { timeout:8000 }).catch(() => {});
    ok(await page.evaluate(() => document.getElementById('how-video').currentTime > 0.3), 'the clip plays in the sheet');
    await tap('#how-done'); await wait(300);
    ok(!(await page.locator('#how-sheet[open]').count()) && !(await page.locator('#guide').isVisible()), 'closing the sheet also retires the strip');
    ok(await page.locator('#how-link').isVisible(), '"How it works" stays in the top bar after Got it');
    await tap('#how-link'); await page.waitForSelector('#how-sheet[open]', { timeout:3000 }).catch(() => {});
    ok(await page.locator('#how-sheet[open]').count(), 'the top-bar link reopens the guide');
    await tap('#how-done'); await wait(300);
    ok(await page.locator('.top').evaluate(e => e.scrollWidth <= e.clientWidth + 1), 'top bar fits the screen', await page.locator('.top').evaluate(e => e.scrollWidth - e.clientWidth) + 'px over');

    // home preview: a real plan on the first screen
    await page.waitForSelector('#preview-stops li', { timeout:15000 });
    const pv = () => page.$$eval('#preview-stops b', bs => bs.map(b => b.textContent));
    ok((await pv()).length >= 2, 'home preview shows a real plan', (await pv()).length);
    const k0 = await page.textContent('#preview-kicker');
    await tap('#preview-another'); await page.waitForFunction(k => document.getElementById('preview-kicker').textContent !== k && !document.getElementById('preview').classList.contains('loading'), k0, { timeout:8000 }).catch(() => {});
    ok(await page.textContent('#preview-kicker') !== k0, '"Another" shows a different night', k0 + ' → ' + await page.textContent('#preview-kicker'));
    const pvNames = await pv(), hp = await page.evaluate(() => history.length);
    await tap('#preview-open'); await page.waitForSelector('#s-plan.on #plan h3', { timeout:8000 });
    ok(JSON.stringify(await page.$$eval('#plan h3', hs => hs.map(h => h.textContent))) === JSON.stringify(pvNames), 'opening the preview keeps exactly those places');
    ok(await page.evaluate(() => history.length) === hp + 1, 'preview opens with one history entry');
    await page.goBack(); await page.waitForSelector('#s-home.on #preview-stops li', { timeout:8000 });
    ok(await page.locator('#preview:not([hidden])').count(), 'preview is back after returning home');
    ok(await overflow() <= 0, 'home: no sideways scroll', await overflow() + 'px');
    ok((await textLeaks()).length === 0, 'home: no untranslated keys', (await textLeaks()).join(','));

    // builder taps keep scroll position
    for (const s of ['#stops-n button >> nth=4', '#types .chip >> nth=1', '#types .chip >> nth=1', '#stops-n button >> nth=3']) {
      await page.locator(s).evaluate(e => e.scrollIntoView({ block:'center' })); await wait(150);
      const y0 = await y();
      await (touch ? page.locator(s).tap() : page.locator(s).click()); await wait(200);
      ok(Math.abs(await y() - y0) < 3, 'home: builder tap keeps scroll (' + s + ')', `${y0} → ${await y()}`);
    }
    await page.selectOption('#start', String(20 * 60)); await wait(80);
    ok(await page.$eval('#start', e => e.value) === '1200', 'home: start time select works');

    // area select + somewhere new + every city tab
    const cities = await page.$$eval('#cities button', bs => bs.map(b => b.dataset.city));
    ok(cities.length >= 5, 'home: city tabs present', cities.length);
    for (const c of cities) {
      await tap(`#cities button[data-city="${c}"]`); await wait(150);
      const on = await page.$eval('#cities .on', b => b.dataset.city).catch(() => null);
      ok(on === c, `city tab ${c} selects`, on);
      ok(await overflow() <= 0, `city ${c}: no sideways scroll`, await overflow() + 'px');
    }
    await tap('#cities button[data-city="london"]'); await wait(150);
    await page.selectOption('#area', 'marylebone'); await wait(150);
    ok(await page.textContent('#area-label') === 'Marylebone', 'area select changes area');
    await page.selectOption('#area', 'soho'); await wait(150);

    // ---------- preset → plan ----------
    const h0 = await page.evaluate(() => history.length);
    await tap('.preset[data-i="0"]');
    await page.waitForSelector('#s-plan.on #plan .stop', { timeout:15000 });
    await wait(400);
    ok(await page.locator('#plan .stop').count() === 4, 'pub crawl plan has 4 stops', await page.locator('#plan .stop').count());
    ok(await page.evaluate(() => scrollY) < 5, 'plan opens at top');
    ok(await page.evaluate(() => history.length) <= h0 + 1, 'plan adds at most one history entry');
    ok(await overflow() <= 0, 'plan: no sideways scroll', await overflow() + 'px');
    ok(await page.locator('#plan .empty').count() === 0, 'plan: no empty stops in Soho');
    ok(!(await page.locator('#rate-banner').isVisible()), 'no "rate the places" banner on a solo plan');
    if (/iPhone|iPad/.test(name)) ok(await page.locator('#app-row').isVisible() && /Home Screen/.test(await page.textContent('#app-row')), 'iPhone: "Add to Home Screen" tip on the plan');
    ok(await page.$eval('#route', a => a.href.startsWith('https://www.google.com/maps/')), 'route link is Google Maps');
    ok(await page.locator('#map .leaflet-marker-icon').count() === 4, 'map shows 4 pins', await page.locator('#map .leaflet-marker-icon').count());

    // tappable things are big enough on phones (≥ 32px; Apple guideline 44)
    if (touch) {
      const small = await page.$$eval('#s-plan button:not([disabled]), #s-plan a.btn', els => els.filter(e => e.offsetParent)
        .map(e => { const r = e.getBoundingClientRect(); return [r.width, r.height, e.textContent.trim().slice(0, 20) || e.getAttribute('aria-label') || e.className]; })
        .filter(([w, h]) => w < 32 || h < 32).map(x => x[2] + ' ' + Math.round(x[0]) + 'x' + Math.round(x[1])));
      ok(small.length === 0, 'plan: tap targets ≥ 32px', small.join(' | '));
    }

    // swap on a lower stop keeps scroll
    const swaps = page.locator('[data-swap]');
    await page.evaluate(() => document.querySelectorAll('[data-swap]')[2].scrollIntoView({ block:'center' }));
    await wait(200);
    let y1 = await y();
    const name2 = await page.locator('#plan h3').nth(2).textContent();
    await (touch ? swaps.nth(2).tap() : swaps.nth(2).click());
    await wait(600);
    ok(await page.locator('#plan h3').nth(2).textContent() !== name2, 'swap changes the venue');
    ok(Math.abs(await y() - y1) < 3, 'swap keeps scroll', `${y1} → ${await y()}`);

    // back to previous venue
    if (await page.locator('[data-back="2"]').count()) {
      await (touch ? page.locator('[data-back="2"]').tap() : page.locator('[data-back="2"]').click()); await wait(300);
      ok(await page.locator('#plan h3').nth(2).textContent() === name2, '"back" restores previous venue');
    } else ok(false, 'back button appears after swap');

    // pin keeps scroll and disables swap
    await page.evaluate(() => document.querySelector('[data-pin="2"]').scrollIntoView({ block:'center' })); await wait(150);
    y1 = await y();
    await (touch ? page.locator('[data-pin="2"]').tap() : page.locator('[data-pin="2"]').click()); await wait(500);
    ok(Math.abs(await y() - y1) < 3, 'pin keeps scroll', `${y1} → ${await y()}`);
    ok(await page.locator('[data-swap="2"]').isDisabled(), 'pinned stop cannot be swapped');
    ok(/pn=2/.test(page.url()), 'pin saved in link');

    // reshuffle keeps pinned
    const pinnedName = await page.locator('#plan h3').nth(2).textContent();
    await tap('#reshuffle'); await wait(700);
    ok(await page.locator('#plan h3').nth(2).textContent() === pinnedName, 'reshuffle keeps the pinned stop');
    await page.evaluate(() => document.querySelector('[data-pin="2"]').scrollIntoView({ block:'center' })); await wait(100);
    await (touch ? page.locator('[data-pin="2"]').tap() : page.locator('[data-pin="2"]').click()); await wait(300);

    // stop sheet: later time, move down, done
    await page.evaluate(() => document.querySelector('[data-menu="1"]').scrollIntoView({ block:'center' })); await wait(150);
    y1 = await y();
    await (touch ? page.locator('[data-menu="1"]').tap() : page.locator('[data-menu="1"]').click());
    await page.waitForSelector('#stop-sheet[open]');
    ok(await visibleSheetFits('#stop-sheet') === 'ok', 'stop sheet fits screen', await visibleSheetFits('#stop-sheet'));
    const tBefore = await page.textContent('#stop-time');
    await tap('#stop-later-time'); await wait(200);
    ok(await page.textContent('#stop-time') !== tBefore, 'stop sheet: + moves the time', tBefore + ' → ' + await page.textContent('#stop-time'));
    const title1 = await page.textContent('#stop-sheet-title');
    await tap('#stop-down'); await wait(200);
    ok(/^3/.test((await page.textContent('#stop-sheet-title')).trim()) || (await page.textContent('#stop-sheet-title')).includes('3'), 'stop sheet: move later renumbers', title1 + ' → ' + await page.textContent('#stop-sheet-title'));
    await tap('#stop-close'); await wait(400);
    ok(!(await page.locator('#stop-sheet[open]').count()), 'stop sheet closes');
    ok(Math.abs(await y() - y1) < 3, 'stop sheet edits keep scroll', `${y1} → ${await y()}`);
    ok(/tm=/.test(page.url()) && /st=/.test(page.url()), 'edited times and order saved in link');

    // add a stop via type sheet
    const nStops = await page.locator('#plan .stop').count();
    await tap('#add-stop'); await page.waitForSelector('#type-sheet[open]');
    ok(await visibleSheetFits('#type-sheet') === 'ok', 'add-stop sheet fits screen', await visibleSheetFits('#type-sheet'));
    await tap('#type-sheet-chips .chip[data-type="latefood"]'); await wait(600);
    ok(await page.locator('#plan .stop').count() === nStops + 1, 'add stop adds one', nStops + ' → ' + await page.locator('#plan .stop').count());

    // choose a place: picker with search
    await page.evaluate(() => document.querySelector('[data-menu="0"]').scrollIntoView({ block:'center' })); await wait(100);
    await (touch ? page.locator('[data-menu="0"]').tap() : page.locator('[data-menu="0"]').click());
    await page.waitForSelector('#stop-sheet[open]');
    await tap('#stop-choose'); await page.waitForSelector('#pick-sheet[open]'); await wait(200);
    ok(await visibleSheetFits('#pick-sheet') === 'ok', 'picker fits screen', await visibleSheetFits('#pick-sheet'));
    const listN = await page.locator('#pick-list [data-pick]').count();
    ok(listN > 3, 'picker lists venues', listN);
    const firstName = (await page.locator('#pick-list [data-pick] b').nth(3).textContent()).trim();
    await page.fill('#pick-search', firstName.slice(0, 5)); await wait(200);
    ok(await page.locator('#pick-list [data-pick]').count() >= 1, 'picker search filters');
    await tap(page.locator('#pick-list [data-pick]').first()); await wait(400);
    ok(!(await page.locator('#pick-sheet[open]').count()), 'picking closes the sheet');
    ok(await page.locator('.card.pinned').count() >= 1, 'picked place is pinned');

    // times sheet: change end
    await tap('#times-btn'); await page.waitForSelector('#times-sheet[open]');
    ok(await visibleSheetFits('#times-sheet') === 'ok', 'times sheet fits screen', await visibleSheetFits('#times-sheet'));
    await page.selectOption('#times-end', String(25 * 60)); await wait(300);
    ok(/e=1500/.test(page.url()), 'times sheet: new end saved');
    await tap('#times-done'); await wait(200);

    // remove a stop
    const nNow = await page.locator('#plan .stop').count();
    await page.evaluate(() => document.querySelector('[data-menu="1"]').scrollIntoView({ block:'center' }));
    await (touch ? page.locator('[data-menu="1"]').tap() : page.locator('[data-menu="1"]').click());
    await page.waitForSelector('#stop-sheet[open]');
    await tap('#stop-remove'); await wait(400);
    ok(await page.locator('#plan .stop').count() === nNow - 1, 'remove stop removes one');

    // report closed: asks first, cancel works
    await page.evaluate(() => document.querySelector('[data-report="0"]').scrollIntoView({ block:'center' }));
    await (touch ? page.locator('[data-report="0"]').tap() : page.locator('[data-report="0"]').click());
    await page.waitForSelector('#report-sheet[open]');
    await tap('#report-no'); await wait(200);
    ok(!(await page.locator('#report-sheet[open]').count()), 'report: cancel closes, nothing reported');

    // feedback sheet
    await tap('#s-plan [data-fb]'); await page.waitForSelector('#fb-sheet[open]');
    ok(await visibleSheetFits('#fb-sheet') === 'ok', 'feedback sheet fits screen', await visibleSheetFits('#fb-sheet'));
    await page.fill('#fb-message', 'QA test message — ignore');
    await tap('#fb-send'); await wait(800);
    ok(!(await page.locator('#fb-sheet[open]').count()), 'feedback sends and closes', await page.textContent('#toast'));

    // tap outside a sheet closes it
    await tap('#times-btn'); await page.waitForSelector('#times-sheet[open]');
    await page.mouse.click(3, 3); await wait(200);
    ok(!(await page.locator('#times-sheet[open]').count()), 'tap outside closes a sheet');

    // back / forward
    await page.goBack(); await page.waitForSelector('#s-home.on', { timeout:5000 }).catch(() => {});
    ok(await page.locator('#s-home.on').count(), 'back from plan returns home');
    await page.goForward(); await page.waitForSelector('#s-plan.on #plan .stop', { timeout:5000 }).catch(() => {});
    ok(await page.locator('#s-plan.on').count(), 'forward reopens the plan');

    // shared hash link reopens the same plan in a fresh tab
    const planUrl = page.url(), names = await page.$$eval('#plan h3', hs => hs.map(h => h.textContent));
    const p2 = await ctx.newPage(); await p2.goto(planUrl); await p2.waitForSelector('#s-plan.on #plan h3', { timeout:15000 });
    ok(JSON.stringify(await p2.$$eval('#plan h3', hs => hs.map(h => h.textContent))) === JSON.stringify(names), 'plan link reopens the identical plan');
    await p2.close();

    // ---------- send to group → /p/ ----------
    await tap('#share'); await page.waitForSelector('#share-sheet[open]', { timeout:8000 });
    ok(await visibleSheetFits('#share-sheet') === 'ok', 'share sheet fits screen', await visibleSheetFits('#share-sheet'));
    ok(/\/p\/[a-z2-9]{6,10}$/.test(await page.textContent('#share-link')), 'share link is a /p/ link', await page.textContent('#share-link'));
    await page.fill('#share-name', 'Alex');
    // Copy link: clipboard may be unavailable in some engines; app falls back to prompt()
    await tap('#share-copy');
    await page.waitForURL(/\/p\//, { timeout:8000 }).catch(() => {});
    await page.waitForSelector('#group:not([hidden])', { timeout:8000 }).catch(() => {});
    ok(/\/p\//.test(page.url()), 'after copying, organiser follows the group link', page.url());
    await wait(800);
    const groupUrl = page.url();
    ok((await page.textContent('#group')).includes('Alex'), 'organiser shows as in the group', await page.textContent('#group'));
    ok(await page.locator('#plan-tools[hidden]').count() === 1, 'group plan is locked (no edit tools)');
    ok(await overflow() <= 0, 'group plan: no sideways scroll', await overflow() + 'px');

    // friend opens it on their own phone
    const ctx2 = await browser.newContext(opts);
    const f = await ctx2.newPage();
    f.on('pageerror', e => errs.push('friend pageerror: ' + e.message));
    await f.goto(groupUrl); await f.waitForSelector('#join-banner:not([hidden])', { timeout:15000 });
    ok((await f.textContent('#join-banner')).includes('Alex'), 'friend sees who invited them', (await f.textContent('#join-banner')).slice(0, 80));
    ok(await f.evaluate(() => scrollY) < 5 && await f.locator('#join-name').isVisible(), 'join form visible at the top');
    await f.fill('#join-name', 'Sam');
    await (touch ? f.locator('#join-form button').tap() : f.locator('#join-form button').click());
    await f.waitForFunction(() => document.getElementById('join-banner').hidden, null, { timeout:8000 }).catch(() => {});
    ok((await f.textContent('#group')).includes('Sam'), 'friend joins the group', await f.textContent('#group'));
    ok(JSON.stringify(await f.$$eval('#plan h3', hs => hs.map(h => h.textContent))) === JSON.stringify(await page.$$eval('#plan h3', hs => hs.map(h => h.textContent))), 'friend sees the identical plan');
    // own copy
    await (touch ? f.locator('#edit').tap() : f.locator('#edit').click()); await wait(500);
    ok(!/\/p\//.test(f.url()) && await f.locator('#plan-tools:not([hidden])').count(), '"make my own version" unlocks editing', f.url());
    await ctx2.close();

    // bad group link
    const p3 = await ctx.newPage(); await p3.goto(BASE + '/p/zzzzzzzz'); await wait(1500);
    ok((await p3.textContent('#toast')).length > 0, 'unknown group link shows a message', await p3.textContent('#toast'));
    await p3.close();

    // ---------- ask the group (vote) ----------
    await page.goto(BASE + '/'); await page.waitForSelector('#stops-n button');
    ok(await page.locator('#group-go').isVisible(), 'big "Plan it with your group" button on home');
    await tap('#group-go'); await page.waitForSelector('#vote-sheet[open]');
    ok(await visibleSheetFits('#vote-sheet') === 'ok', 'vote setup sheet fits screen', await visibleSheetFits('#vote-sheet'));
    await tap('#vote-setup-areas .chip:not(.on)');
    await tap('#vote-setup-go'); await page.waitForSelector('#share-sheet[open]', { timeout:8000 }).catch(() => {});
    ok(/\/v\//.test(await page.textContent('#share-link').catch(() => '')), 'vote creates a /v/ link');
    await tap('#share-copy');
    await page.waitForSelector('#s-vote.on', { timeout:8000 }).catch(() => {});
    ok(await page.locator('#s-vote.on').count(), 'organiser lands on the vote page');
    ok(await overflow() <= 0, 'vote page: no sideways scroll', await overflow() + 'px');
    const voteUrl = page.url();
    await page.fill('#vote-name', 'Alex');
    await tap('#vote-pick-types .chip[data-id="pub"]'); await tap('#vote-pick-types .chip[data-id="cocktail"]');
    const ends = await page.$$eval('#vote-pick-end button', bs => bs.map(b => b.textContent));
    ok(ends.length && !ends.includes('1pm'), 'vote "until" only offers times after the start', ends.join(' '));
    await tap('#vote-pick-style button[data-v="gems"]');
    ok(await page.locator('#vote-pick-style button[data-v="gems"].on').count(), 'vote: hidden gems selected');
    await page.fill('#vote-love-search', 'the'); await page.waitForSelector('#vote-love-list [data-love]', { timeout:8000 });
    const loved = (await page.locator('#vote-love-list [data-love] b').first().textContent()).trim();
    await tap(page.locator('#vote-love-list [data-love]').first());
    ok((await page.textContent('#vote-loved')).includes(loved), 'vote: a loved place is added', loved);
    await page.evaluate(() => document.getElementById('vote-save').scrollIntoView({ block:'center' })); await wait(100);
    y1 = await y();
    await tap('#vote-save'); await wait(1200);
    ok((await page.textContent('#vote-who')).includes('Alex'), 'vote saved and counted', await page.textContent('#vote-who'));
    await page.waitForFunction(n => document.getElementById('vote-who').textContent.includes(n), loved, { timeout:8000 }).catch(() => {});
    ok((await page.textContent('#vote-who')).includes('Hidden gems') && (await page.textContent('#vote-who')).includes(loved), 'tally shows style and loved place', await page.textContent('#vote-who'));
    ok(Math.abs(await y() - y1) < 40, 'saving a vote keeps your place', `${y1} → ${await y()}`);
    // friend votes
    const ctx3 = await browser.newContext(opts); const g = await ctx3.newPage();
    g.on('pageerror', e => errs.push('voter pageerror: ' + e.message));
    await g.goto(voteUrl); await g.waitForSelector('#s-vote.on', { timeout:15000 });
    await g.fill('#vote-name', 'Sam');
    await (touch ? g.locator('#vote-pick-types .chip[data-id="pub"]').tap() : g.locator('#vote-pick-types .chip[data-id="pub"]').click());
    await (touch ? g.locator('#vote-save').tap() : g.locator('#vote-save').click()); await wait(1200);
    ok((await g.textContent('#vote-who')).includes('Sam'), 'friend vote counted');
    // organiser makes plan
    await page.reload(); await page.waitForSelector('#vote-make', { timeout:10000 }).catch(() => {});
    ok((await page.textContent('#vote-who')).includes('Sam'), 'organiser sees friend vote after reload');
    await tap('#vote-make'); await page.waitForURL(/\/p\//, { timeout:15000 }).catch(() => {});
    await wait(1000);
    ok(/\/p\//.test(page.url()) && await page.locator('#plan h3').count() >= 2, 'make plan from votes → group plan', page.url());
    const planNames = await page.$$eval('#plan h3', hs => hs.map(h => h.textContent.trim()));
    ok(planNames.includes(loved), 'the loved place is in the plan', loved + ' vs ' + planNames.join(', '));
    ok(/Sam/.test(await page.textContent('#group')) && /Alex/.test(await page.textContent('#group')), 'voters are already in the group', await page.textContent('#group'));
    await g.reload(); await wait(2000);
    ok(/\/p\//.test(g.url()), 'vote link now opens the group plan for friends', g.url());
    await ctx3.close();

    // ---------- languages ----------
    await page.goto(BASE + '/'); await page.waitForSelector('#stops-n button');
    for (const l of ['fr', 'es', 'it', 'pt', 'en']) {
      await page.selectOption('#lang', l); await wait(250);
      ok(await overflow() <= 0, `${l}: home no sideways scroll`, await overflow() + 'px');
      const leaks = await textLeaks();
      ok(leaks.length === 0, `${l}: home no untranslated keys`, leaks.join(','));
      if (l !== 'en') {
        await tap('.preset[data-i="2"]'); await page.waitForSelector('#s-plan.on #plan h3', { timeout:15000 }); await wait(300);
        ok(await overflow() <= 0, `${l}: plan no sideways scroll`, await overflow() + 'px');
        const pl = await textLeaks(); ok(pl.length === 0, `${l}: plan no untranslated keys`, pl.join(','));
        await page.goBack(); await page.waitForSelector('#s-home.on');
      }
    }

    // about
    await tap((await page.locator('#about-link').isVisible()) ? '#about-link' : '#foot-about'); await wait(200);
    ok(await page.locator('#s-about.on').count() && await overflow() <= 0, 'about opens, no sideways scroll');
    await page.goBack(); await wait(200);

    // ---------- other pages ----------
    for (const path of ['/neighbourhoods', '/privacy', '/terms', '/london', '/london/soho', '/paris', '/fr/paris/le-marais', '/stats', '/swipe', '/does-not-exist']) {
      const r = await page.goto(BASE + path); await wait(400);
      const st = r ? r.status() : 0;
      ok(path === '/does-not-exist' ? st === 404 : st === 200, `${path}: status`, st);
      ok(await overflow() <= 0, `${path}: no sideways scroll`, await overflow() + 'px');
    }
  } catch (e) {
    ok(false, 'EXCEPTION after "' + (results.at(-1)||{}).msg + '"', e.message.split('\n')[0]);
    await page.screenshot({ path:`shot-${name.replace(/\W+/g, '_')}.png` }).catch(() => {});
  }
  ok(errs.length === 0, 'no JS errors', [...new Set(errs)].slice(0, 6).join(' | '));
  await browser.close();
  return { name, results };
}

const todo = DEVICES.filter(d => !only || d[0].toLowerCase().includes(only.toLowerCase()));
const all = [];
for (const d of todo) { all.push(await runDevice(d).catch(e => ({ name:d[0], results:[{ pass:false, msg:'crash: ' + e.message }] }))); await wait(20000); }
let fails = 0;
for (const { name, results } of all) {
  const bad = results.filter(r => !r.pass);
  fails += bad.length;
  console.log(`\n## ${name}: ${results.length - bad.length}/${results.length} pass`);
  bad.forEach(r => console.log('  FAIL ' + r.msg));
}
console.log('\nTOTAL FAILS', fails);
