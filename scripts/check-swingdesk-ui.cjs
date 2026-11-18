// Browser integration checks use isolated API fixtures; never place real trades.
const puppeteer = require('puppeteer-core');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const output = path.resolve('reports/swingdesk-ui');
fs.mkdirSync(output, { recursive: true });
const capital = { tradingCapital: 100000, maxRiskPct: 2, maxPositions: 5, maxSectorConc: 2 };
const setups = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ITC'].map((ticker, i) => ({ ticker, companyName: ['Reliance Industries', 'Tata Consultancy Services', 'Infosys', 'HDFC Bank', 'ITC'][i], sector: ['Energy', 'Information Technology', 'Information Technology', 'Banking', 'Consumer Goods'][i], id: ticker, ltp: 1245 + i * 100, changePct: 1.24, buyZone: 1230 + i * 100, buyZoneMax: 1260 + i * 100, target1: 1360 + i * 100, stopLoss: 1200 + i * 100, confidenceScore: 7.5, riskReward: 2.5, status: 'QUALIFIED', triggerConfirmed: false, setupType: 'Breakout watch', aiSignal: 'WATCH', aiReasons: ['Price is holding above the 50-day moving average.', 'Volume is building near resistance.', 'Wait for the entry trigger to confirm.'], rsi14: 57.4, ema20: 1210, ema50: 1180 }));
let watchlist = []; let trades = []; let chartFailure = false; let sessionFailure = false; let chatFailure = false;
const requests = [];
const candles = Array.from({ length: 260 }, (_, i) => {
  const open = 600 + i * 2.4 + Math.sin(i * .14) * 75;
  const close = open + Math.sin(i * .8) * 17;
  return { time: new Date(Date.UTC(2021, 0, 4 + i * 7)).toISOString().slice(0, 10), open, high: Math.max(open, close) + 10, low: Math.min(open, close) - 10, close, volume: 1000000 + Math.floor(Math.abs(Math.sin(i)) * 2500000) };
});
async function mock(request) {
  const url = new URL(request.url());
  if (!url.pathname.startsWith('/api/')) return request.continue();
  const endpoint = url.pathname; const method = request.method();
  const body = request.postData() ? JSON.parse(request.postData()) : {};
  requests.push({ endpoint, method, body, query: url.search });
  let data; let status = 200;
  if (endpoint === '/api/workspace/session') { status = sessionFailure ? 503 : 200; data = sessionFailure ? { message: 'Workspace database unavailable.' } : { token: 'ui-fixture-token', mode: 'personal', user: { id: 'fixture', ...capital } }; }
  else if (endpoint === '/api/last') data = { data: { setups, timestamp: '2026-11-16T10:00:00Z', diagnostics: { summary: 'Five research setups require confirmation.' } } };
  else if (endpoint === '/api/user/capital') { if (method === 'PUT') Object.assign(capital, body); data = { data: capital }; }
  else if (endpoint === '/api/watchlist') { if (method === 'POST') watchlist.push({ ...body, id: body.ticker, addedAt: '2026-11-17' }); data = { data: watchlist }; }
  else if (endpoint.startsWith('/api/watchlist/')) { watchlist = watchlist.filter(t => t.ticker !== decodeURIComponent(endpoint.split('/').pop())); data = { success: true }; }
  else if (endpoint === '/api/portfolio/trades') { if (method === 'POST') trades.push({ ...body, id: `paper-${trades.length}`, status: 'OPEN', entryDate: '2026-11-17T10:00:00Z' }); data = { data: trades, trade: trades.at(-1) }; }
  else if (endpoint.startsWith('/api/portfolio/trades/')) { const trade = trades.find(t => t.id === endpoint.split('/').pop()); if (trade) Object.assign(trade, body, body.exitPrice ? { status: 'CLOSED', pnlRs: (body.exitPrice - trade.entryPrice) * trade.quantity } : {}); data = { data: trade }; }
  else if (endpoint.startsWith('/api/workspace/chart/')) { status = chartFailure ? 502 : 200; data = chartFailure ? { message: 'History temporarily unavailable.' } : { data: { candles, source: 'UI test fixture', from: candles[0].time, to: candles.at(-1).time, note: 'Illustrative test data; not market prices.' } }; }
  else if (endpoint === '/api/workspace/instruments') data = { data: setups.filter(s => s.ticker.includes((url.searchParams.get('q') || '').toUpperCase())) };
  else if (endpoint === '/api/workspace/readiness') data = { data: { state: { eod: 'READY', scan: 'READY', tick: 'DISABLED', automaticScan: 'DISABLED', automaticExecution: 'DISABLED' }, eod: { tradingDate: '2026-11-16', status: 'READY', readySymbolCount: 240, symbolCount: 250 }, scan: { lastSuccessfulScanAt: '2026-11-16T10:00:00Z', active: null }, feed: { connected: false, latestTickAt: null, trackedSymbols: 0 }, market: { isOpen: false, label: 'Closed (After Hours)' }, mode: 'PERSONAL_RESEARCH', checkedAt: '2026-11-17T10:00:00Z' } };
  else if (endpoint.startsWith('/api/workspace/live-quote/')) data = { data: { ticker: endpoint.split('/').pop(), live: false, price: null, lastTradeAt: null, source: null, market: 'Closed (After Hours)', reason: 'Market closed' } };
  else if (endpoint.endsWith('/deep-dive')) { const ticker = endpoint.split('/')[3]; const stock = setups.find(s => s.ticker === ticker) || setups[0]; data = { data: { ...stock, price: { current: stock.ltp, dayChangePct: 1.24, high52w: 1500, low52w: 980 }, fundamentals: { marketCapCr: 1700000, peRatio: 24.5, pbRatio: 2.1, rocePct: 14.2, roePct: 12.5, debtToEquity: .42, promoterHoldingPct: 50.2, fiiHoldingPct: 21.3, diiHoldingPct: 18.5 }, technicals: { rsi14: 57.4, ema20: 1210, ema50: 1180, dma200: 1100, trend: 'Constructive' }, aiAudit: { verdict: 'Price structure is constructive. A confirmed breakout and controlled entry risk are still needed.', pros: ['Trading above the key moving averages.'], cons: ['Resistance remains close to the proposed entry.'] }, institutionalDeals: [] } }; }
  else if (endpoint.endsWith('/news')) data = { news: [{ id: 'news-1', title: 'Quarterly results remain the next catalyst', summary: 'Review the upcoming results and compare the reported operating performance.', source: 'UI fixture', publishedAt: '2026-11-16T10:00:00Z', url: 'https://example.com/research' }] };
  else if (endpoint === '/api/fii-dii') data = { data: { latest: { fiiNet: -1234.5, diiNet: 2100.2, tradingDate: '2026-11-16', source: 'UI fixture' }, isStale: false } };
  else if (endpoint === '/api/chat') { status = chatFailure ? 503 : 200; data = chatFailure ? { message: 'Research service unavailable.' } : { reply: 'The setup is still awaiting confirmation.\n\nReview the entry trigger, stop-loss distance, and upcoming earnings before recording a paper trade.\n\nWhat to watch\n- A close above the entry level\n- Volume above the required baseline\n- Price staying within the entry limit\n\nWhat would invalidate it?\nA break below the planned stop or an expired setup.', stockCard: { ticker: 'TCS', price: 1345, signal: 'WATCH', buyZone: 1330, stopLoss: 1300, target: 1460, riskReward: 2.5 }, sources: ['https://example.com/research'], meta: { grounded: true, supportLevel: 'partial', liveDataUsed: false, scannerContextUsed: true, dataUsed: ['scanner'], lastUpdated: '2026-11-16T10:00:00Z', notes: ['UI test response, not investment research.'] } }; }
  else if (endpoint === '/api/scans') data = { scan: { id: 'scan-1', status: 'QUEUED', progressPct: 0, stage: 'Queued' } };
  else if (endpoint === '/api/scan/status') data = { data: { active: null, latest: { id: 'scan-1', status: 'COMPLETED', progressPct: 100, stage: 'Complete' } } };
  else { status = 404; data = { message: `Unmocked endpoint ${endpoint}` }; }
  return request.respond({ status, contentType: 'application/json', body: JSON.stringify(data) });
}
async function clickText(page, text) {
  const found = await page.evaluate(text => {
    const el = [...document.querySelectorAll('button')].find(b => (b.textContent || '').trim() === text && b.getBoundingClientRect().width > 0);
    if (!el) return false; el.click(); return true;
  }, text);
  assert.ok(found, `Button not found: ${text}`);
}
async function waitText(page, text) { await page.waitForFunction(text => document.body.textContent.includes(text), { timeout: 12000 }, text); }
async function clickWithin(page, selector, text) {
  const found = await page.evaluate(({ selector, text }) => {
    const el = [...document.querySelectorAll(`${selector} button`)].find(b => (b.textContent || '').trim() === text && b.getBoundingClientRect().width > 0);
    if (!el) return false; el.click(); return true;
  }, { selector, text });
  assert.ok(found, `Button not found in ${selector}: ${text}`);
}
async function fill(page, selector, value) { await page.focus(selector); await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace'); if (String(value)) await page.type(selector, String(value)); }
async function main() {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-first-run', '--disable-extensions'] });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1440, height: 1050, deviceScaleFactor: 1 });
    await page.setRequestInterception(true); page.on('request', r => void mock(r));
    await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle0' });
    await waitText(page, 'RELIANCE');
    await page.waitForSelector('canvas');
    assert.ok(requests.some(r => r.query.includes('range=5Y')), 'Five-year initial request');
    assert.ok(!(await page.$('input[type="password"]')), 'No login UI');
    await page.screenshot({ path: path.join(output, 'workspace-desktop.png'), fullPage: true });
    await clickText(page, 'All');
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'All' && b.getAttribute('aria-pressed') === 'true'));
    await page.waitForSelector('canvas');
    assert.ok(requests.some(r => r.query.includes('range=ALL')), 'All-history request');
    await clickText(page, 'Financials'); await waitText(page, 'ROCE');
    await clickText(page, 'News & flows'); await waitText(page, 'Quarterly results');
    await clickText(page, 'Trade history');
    await page.click('[aria-label="Save to watchlist"]');
    await page.waitForSelector('[aria-label="Remove from watchlist"]');
    assert.equal(watchlist[0].ticker, 'RELIANCE');
    await clickText(page, 'Watchlist');
    await page.click('[aria-label="Remove from watchlist"]');
    await waitText(page, 'Save a stock to build your watchlist.');
    assert.equal(watchlist.length, 0);
    await clickText(page, 'Discover');
    await page.type('[aria-label="Search NSE stocks"]', 'TCS');
    await page.waitForFunction(() => document.querySelectorAll('.sd-stock-row').length === 1 && document.querySelector('.sd-stock-row').textContent.includes('TCS'));
    await page.click('.sd-stock-row');
    await page.waitForFunction(() => document.querySelector('.sd-stock-title h2').textContent.includes('TCS'));
    await fill(page, '[aria-label="Search NSE stocks"]', '');
    await clickText(page, 'Record paper trade');
    await page.waitForSelector('dialog[open]');
    await fill(page, '[name="quantity"]', 1000);
    await clickText(page, 'Save paper record');
    await waitText(page, 'This position exceeds your available paper capital.');
    assert.equal(trades.length, 0, 'Invalid trade must not reach API');
    await fill(page, '[name="quantity"]', 2);
    await clickText(page, 'Save paper record');
    await page.waitForSelector('dialog[open]', { hidden: true, timeout: 7000 }).catch(async e => { console.log(await page.$eval('dialog', el => ({ text: el.textContent, fields: [...el.querySelectorAll('input')].map(i => [i.name,i.value,i.validationMessage]) }))); throw e; });
    assert.equal(trades.length, 1); assert.equal(trades[0].ticker, 'TCS');
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Stop'));
    await clickText(page, 'Stop');
    await fill(page, '[name="stopLossTrail"]', 1310);
    await clickText(page, 'Save paper record');
    await page.waitForSelector('dialog[open]', { hidden: true });
    assert.equal(trades[0].stopLossTrail, 1310);
    await clickText(page, 'Close');
    await fill(page, '[name="exitPrice"]', 1400);
    await clickText(page, 'Close paper trade');
    await page.waitForSelector('dialog[open]', { hidden: true });
    assert.equal(trades[0].status, 'CLOSED');
    await page.click('[aria-label="Capital settings"]');
    await fill(page, '[name="maxRiskPct"]', 1.5);
    await clickText(page, 'Save settings');
    await page.waitForSelector('dialog[open]', { hidden: true });
    assert.equal(capital.maxRiskPct, 1.5);
    await clickText(page, 'Scan market');
    await page.waitForFunction(() => document.body.textContent.includes('Scan completed.') || document.body.textContent.includes('Scan complete.'), { timeout: 12000 });
    chartFailure = true; await clickText(page, '1M'); await waitText(page, 'History temporarily unavailable.');
    chartFailure = false; await clickText(page, 'Retry chart'); await page.waitForSelector('canvas');
    await clickText(page, 'Research Assistant');
    await page.waitForSelector('.sd-chat-shell');
    await page.waitForSelector('.sd-assistant-context canvas');
    await waitText(page, 'Conversations'); await waitText(page, 'In context');
    const columns = await page.evaluate(() => {
      const left = document.querySelector('.sd-conversations').getBoundingClientRect();
      const center = document.querySelector('.sd-chat').getBoundingClientRect();
      const right = document.querySelector('.sd-assistant-context').getBoundingClientRect();
      return { leftRight: left.right, centerLeft: center.left, centerRight: center.right, rightLeft: right.left };
    });
    assert.ok(columns.leftRight <= columns.centerLeft + 2 && columns.centerRight <= columns.rightLeft + 2, 'Assistant has three non-overlapping desktop columns');
    assert.ok(await page.$eval('.sd-assistant-context', el => el.textContent.includes('TCS') && el.textContent.includes('1,00,000')), 'Context rail uses selected ticker and account capital');
    const chartRequestsBefore = requests.length;
    const allContextResponse = page.waitForResponse(r => r.url().includes('/api/workspace/chart/TCS') && r.url().includes('range=ALL'));
    await clickWithin(page, '.sd-assistant-context', 'All');
    await allContextResponse;
    await page.waitForSelector('.sd-assistant-context canvas');
    assert.ok(requests.slice(chartRequestsBefore).some(r => r.endpoint.endsWith('/TCS') && r.query.includes('range=ALL')), 'Context chart requests all selected-stock history');
    await clickWithin(page, '.sd-assistant-context', '5Y');
    await page.type('#sd-research-prompt', 'What risks should I check?');
    await page.click('[aria-label="Send research question"]');
    await waitText(page, 'The setup is still awaiting confirmation.');
    assert.ok(requests.some(r => r.endpoint === '/api/chat' && r.body.message.includes('TCS')), 'Assistant shares selected ticker');
    chatFailure = true;
    await page.type('#sd-research-prompt', 'What confirms the entry?');
    await page.click('[aria-label="Send research question"]');
    await waitText(page, 'Research service unavailable.');
    chatFailure = false; await clickText(page, 'Retry response');
    await page.waitForFunction(() => document.querySelectorAll('.sd-chat-turn').length === 2 && !document.querySelector('.sd-chat-error'));
    const originalConversation = await page.$eval('.sd-conversation-select', el => el.textContent.trim());
    await clickText(page, 'New conversation');
    await page.waitForFunction(() => document.querySelectorAll('.sd-chat-turn').length === 0);
    await page.type('#sd-research-prompt', 'Compare this setup with my watchlist.');
    await page.click('[aria-label="Send research question"]');
    await waitText(page, 'The setup is still awaiting confirmation.');
    await page.waitForFunction(() => document.querySelectorAll('.sd-conversation-select').length >= 2);
    await clickText(page, originalConversation);
    await waitText(page, 'What risks should I check?');
    assert.equal(await page.$$eval('.sd-chat-turn', els => els.length), 2, 'Returning to a saved conversation restores only its turns');
    await waitText(page, '1,330'); await waitText(page, '1,460');
    await page.screenshot({ path: path.join(output, 'assistant-desktop.png'), fullPage: true });
    await page.reload({ waitUntil: 'networkidle0' });
    await clickText(page, 'Research Assistant'); await waitText(page, 'What risks should I check?');
    assert.equal(await page.$$eval('.sd-conversation-select', els => els.length), 3, 'Conversation list persists across reload');
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.screenshot({ path: path.join(output, 'assistant-mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Assistant mobile layout must not overflow horizontally');
    await page.setViewport({ width: 1440, height: 1050, deviceScaleFactor: 1 });
    await clickText(page, originalConversation);
    await page.waitForSelector('.sd-open-workspace');
    await page.click('.sd-open-workspace');
    await page.waitForSelector('.sd-stock-title h2');
    assert.ok(await page.$eval('.sd-stock-title h2', el => el.textContent.includes('TCS')), 'Open in workspace retains the conversation stock');
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.screenshot({ path: path.join(output, 'workspace-mobile.png'), fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    assert.equal(overflow, false, 'Mobile page must not overflow horizontally');
    sessionFailure = true;
    await page.reload({ waitUntil: 'networkidle0' });
    await waitText(page, 'Workspace database unavailable.');
    sessionFailure = false; await clickText(page, 'Retry'); await page.waitForSelector('canvas');
    assert.deepEqual(errors, [], 'No browser runtime errors');
    fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify({ passed: ['workspace render', 'no login UI', 'five-year initial chart', 'all-history range', 'financials', 'news and flows', 'portfolio tab', 'watchlist add and remove', 'symbol search and selection', 'paper cash validation', 'paper entry', 'trailing stop update', 'paper exit', 'capital settings', 'scan polling', 'chart failure and retry', 'assistant three-column layout', 'assistant account and stock context', 'assistant context chart ranges', 'assistant context and response', 'assistant failure and retry', 'new conversation', 'saved conversation switching', 'structured trade levels', 'assistant persistence', 'assistant mobile overflow', 'open conversation stock in workspace', 'mobile overflow', 'session failure and retry', 'no runtime errors'], fixtureData: true, requests: requests.map(({ endpoint, method, query }) => ({ endpoint, method, query })) }, null, 2));
    console.log('SwingDesk browser checks passed. Screenshots: reports/swingdesk-ui');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
