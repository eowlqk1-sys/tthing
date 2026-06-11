const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = __dirname;
const dataDir = path.join(root, 'data');
const mainBannerFile = path.join(dataDir, 'main-banner.json');
const storeSettingsFile = path.join(dataDir, 'store-settings.json');
const bannerUploadDir = path.join(root, 'tthing', 'uploads', 'main-banners');

function loadEnvFile(filePath = path.join(root, '.env')) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex === -1) return;
    const key = trimmed.slice(0, equalIndex).trim();
    let value = trimmed.slice(equalIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  });
}

loadEnvFile();
const port = Number(process.env.PORT || 8001);
const mode = process.env.DREAM_AUTH_MODE || (process.env.NODE_ENV === 'production' ? 'prod' : 'mock');
const pending = new Map();

const mobileOkEnv = process.env.DREAM_AUTH_ENV || (mode === 'prod' || mode === 'production' ? 'prod' : 'dev');
const dreamServiceUrl = mobileOkEnv === 'prod'
  ? 'https://cert.mobile-ok.com/gui/service/v1/result/request'
  : 'https://scert.mobile-ok.com/gui/service/v1/result/request';
const dreamReturnUrl = process.env.DREAM_RETURN_URL || ('http://localhost:' + port + '/api/dream-auth/result');
const dreamKeyPath = process.env.DREAM_KEY_PATH || path.join(root, mobileOkEnv === 'prod' ? 'prod_keys/mok_keyInfo.dat' : 'dev_keys/mok_keyInfo.dat');
const dreamKeyPassword = process.env.DREAM_KEY_PASSWORD || '';
const dreamClientPrefix = (process.env.DREAM_CLIENT_PREFIX || 'EOWLQK1').replace(/[^0-9a-z]/gi, '').slice(0, 8) || 'EOWLQK1';
const kopayConfig = {
  mode: process.env.KOPAY_MODE || 'prod',
  mid: process.env.KOPAY_MID || '',
  mkey: process.env.KOPAY_MKEY || '',
  baseUrl: process.env.KOPAY_BASE_URL || 'https://payments.korpay.com/v1',
  returnUrl: process.env.KOPAY_RETURN_URL || ('http://localhost:' + port + '/api/kopay/return')
};
const alimtalkConfig = {
  apiKey: process.env.ALIMTALK_API_KEY || '',
  businessKey: process.env.ALIMTALK_BUSINESS_KEY || '',
  kakaoLoginKey: process.env.ALIMTALK_KAKAO_LOGIN_KEY || ''
};

let mobileOK = null;
try {
  mobileOK = require(path.join(root, 'dreamsecurity/mok_Key_Manager_v1.0.3.js'));
  if (fs.existsSync(dreamKeyPath) && dreamKeyPassword) mobileOK.keyInit(dreamKeyPath, dreamKeyPassword);
  else mobileOK = null;
} catch (error) {
  mobileOK = null;
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 120 * 1024 * 1024) req.destroy();
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function parseRequestBody(req) {
  const raw = await readRawBody(req);
  if (!raw) return {};
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  try { return JSON.parse(raw); }
  catch (error) { return { data: raw }; }
}

function readBody(req) {
  return parseRequestBody(req);
}

function isAdultBirth(birth) {
  if (!/^\d{8}$/.test(String(birth || ''))) return true;
  const year = Number(birth.slice(0, 4));
  const month = Number(birth.slice(4, 6)) - 1;
  const day = Number(birth.slice(6, 8));
  const birthday = new Date(year, month, day);
  const today = new Date();
  let age = today.getFullYear() - birthday.getFullYear();
  const beforeBirthday = today.getMonth() < birthday.getMonth() || (today.getMonth() === birthday.getMonth() && today.getDate() < birthday.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 19;
}

function mockCi(value) {
  return crypto.createHash('sha256').update('ci:' + value).digest('hex');
}

function makeClientTxId() {
  return dreamClientPrefix + crypto.randomUUID().replace(/-/g, '').slice(0, 26);
}

function currentMokDate(date = new Date()) {
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0')
  ];
  return parts.join('');
}

function currentKorpayDate(date = new Date()) {
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0')
  ];
  return parts.join('');
}

function isMobileOkReady() {
  return mode !== 'mock' && mobileOK && typeof mobileOK.RSAEncrypt === 'function' && typeof mobileOK.getServiceId === 'function';
}

function normalizeMokResult(result, txId) {
  const birth = String(result.userBirthday || '');
  return {
    verified: true,
    provider: 'dreamsecurity',
    txId: result.txId || txId || '',
    clientTxId: result.clientTxId || '',
    name: result.userName || '',
    phone: result.userPhone || '',
    birth,
    gender: result.userGender || '',
    nation: result.userNation || '',
    ci: result.ci || '',
    di: result.di || '',
    adult: isAdultBirth(birth)
  };
}

async function handleDreamAuthStart(req, res) {
  const payload = await readBody(req);
  const name = String(payload.name || '').trim();
  const phone = String(payload.phone || '').replace(/[^0-9]/g, '');
  const birth = String(payload.birth || '').replace(/[^0-9]/g, '');
  if (!name || phone.length < 10) {
    sendJson(res, 400, { error: 'name_and_phone_required' });
    return;
  }

  if (isMobileOkReady()) {
    sendJson(res, 200, { useStandardWindow: true, requestUrl: '/api/dream-auth/request', resultUrl: '/api/dream-auth/result' });
    return;
  }

  if (mode !== 'mock') {
    sendJson(res, 503, { error: 'mobileok_key_not_ready', message: 'MobileOK 운영 키 또는 Node 라이브러리가 준비되지 않았습니다.' });
    return;
  }

  const txId = crypto.randomUUID();
  const mockCode = String(Math.floor(100000 + Math.random() * 900000));
  pending.set(txId, { name, phone, birth, mockCode, createdAt: Date.now() });
  sendJson(res, 200, { txId, mockCode, expiresIn: 180 });
}

async function handleDreamAuthRequest(req, res) {
  if (!isMobileOkReady()) {
    sendJson(res, 503, { error: 'mobileok_key_not_ready' });
    return;
  }

  const clientTxId = makeClientTxId();
  const clientTxInfo = clientTxId + '|' + currentMokDate();
  pending.set(clientTxId, { createdAt: Date.now() });

  const authRequest = {
    usageCode: '01001',
    serviceId: mobileOK.getServiceId(),
    encryptReqClientInfo: mobileOK.RSAEncrypt(clientTxInfo),
    serviceType: 'telcoAuth',
    retTransferType: 'MOKToken',
    returnUrl: dreamReturnUrl
  };
  sendJson(res, 200, authRequest);
}

async function handleDreamAuthVerify(req, res) {
  const payload = await readBody(req);
  const txId = String(payload.txId || '');
  const code = String(payload.code || '').trim();
  const item = pending.get(txId);
  if (!item || Date.now() - item.createdAt > 180000) {
    sendJson(res, 400, { verified: false, error: 'expired' });
    return;
  }
  if (code !== item.mockCode) {
    sendJson(res, 400, { verified: false, error: 'invalid_code' });
    return;
  }

  pending.delete(txId);
  sendJson(res, 200, {
    verified: true,
    provider: 'dreamsecurity',
    txId,
    name: item.name,
    phone: item.phone,
    adult: isAdultBirth(item.birth),
    ci: mockCi(item.phone),
    di: mockCi(item.phone + ':' + txId)
  });
}

async function handleDreamAuthResult(req, res) {
  if (!isMobileOkReady()) {
    sendJson(res, 503, { error: 'mobileok_key_not_ready' });
    return;
  }

  const body = req.method === 'GET'
    ? Object.fromEntries(new URL(req.url, 'http://localhost').searchParams)
    : await readBody(req);
  let data = body.data || body.result || body;
  if (typeof data === 'string') {
    try { data = JSON.parse(decodeURIComponent(data)); }
    catch (error) {
      try { data = JSON.parse(data); }
      catch (innerError) {}
    }
  }
  const encryptMOKKeyToken = body.encryptMOKKeyToken || data?.encryptMOKKeyToken || data;
  if (!encryptMOKKeyToken) {
    sendJson(res, 400, { verified: false, error: 'missing_mok_token' });
    return;
  }

  const resultResponse = await fetch(dreamServiceUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ encryptMOKKeyToken })
  }).then((response) => response.json());

  if (resultResponse.resultCode !== '2000' || !resultResponse.encryptMOKResult) {
    sendJson(res, 400, { verified: false, error: 'mobileok_result_failed', result: resultResponse });
    return;
  }

  const decrypted = JSON.parse(mobileOK.getResult(resultResponse.encryptMOKResult));
  sendJson(res, 200, normalizeMokResult(decrypted));
}


function kopayReady() {
  return !!(kopayConfig.mid && kopayConfig.mkey && kopayConfig.baseUrl);
}

function publicKopayStatus() {
  return {
    configured: kopayReady(),
    hasMid: !!kopayConfig.mid,
    hasMkey: !!kopayConfig.mkey,
    hasBaseUrl: !!kopayConfig.baseUrl,
    mode: kopayConfig.mode
  };
}

async function handleKopayStatus(req, res) {
  sendJson(res, 200, publicKopayStatus());
}

async function handleKopayPrepare(req, res) {
  const payload = await readBody(req);
  const amount = Number(payload.amount || 0);
  const orderNo = String(payload.orderNo || '');
  const productName = String(payload.productName || '').trim();
  if (!amount || !orderNo) {
    sendJson(res, 400, { error: 'invalid_payment_request' });
    return;
  }
  if (!productName) {
    sendJson(res, 400, { error: 'product_name_required' });
    return;
  }
  if (!kopayReady()) {
    sendJson(res, 503, {
      error: 'kopay_not_ready',
      message: 'Kopay MID/MKEY 또는 결제 BASE URL 설정을 확인해 주세요.',
      status: publicKopayStatus()
    });
    return;
  }

  const ediDate = currentKorpayDate();
  const hashKey = crypto.createHash('sha256').update(kopayConfig.mid + ediDate + amount + kopayConfig.mkey).digest('hex');
  sendJson(res, 200, {
    baseUrl: kopayConfig.baseUrl,
    paymentData: {
      merchantId: kopayConfig.mid,
      productName,
      orderNumber: orderNo.replace(/[^0-9a-z]/gi, ''),
      amount,
      payMethod: 'card',
      returnUrl: kopayConfig.returnUrl,
      ediDate,
      hashKey,
      customerName: String(payload.buyer || '').trim(),
      customerEmail: String(payload.email || '').trim(),
      customerPhone: String(payload.phone || '').replace(/[^0-9]/g, ''),
      customerAddress: String(payload.address || '').trim(),
      customerPost: String(payload.postcode || '').replace(/[^0-9]/g, ''),
      reserved: orderNo,
      language: 'ko'
    }
  });
}

function redirectHtml(res, target) {
  res.writeHead(303, { Location: target });
  res.end();
}

function readFormBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) req.destroy();
    });
    req.on('end', () => resolve(Object.fromEntries(new URLSearchParams(body))));
    req.on('error', reject);
  });
}

async function handleKopayReturn(req, res) {
  const data = req.method === 'POST'
    ? await readFormBody(req)
    : Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);
  const orderNumber = String(data.orderNumber || data.reserved || '');
  const failUrl = '/tthing/order.html?payment=failed&order=' + encodeURIComponent(orderNumber);

  if (data.resultCode !== '0000' || !data.paymentKey) {
    redirectHtml(res, failUrl + '&message=' + encodeURIComponent(data.message || 'card_auth_failed'));
    return;
  }

  try {
    const query = new URLSearchParams({ paymentKey: data.paymentKey }).toString();
    const response = await fetch(kopayConfig.baseUrl.replace(/\/$/, '') + '/payments/confirm?' + query, { method: 'POST' });
    const result = await response.json();
    if (response.status !== 200 || result.resultCode !== '3001') {
      redirectHtml(res, failUrl + '&message=' + encodeURIComponent(result.message || 'card_confirm_failed'));
      return;
    }
    const success = new URL('/tthing/order.html', 'http://localhost');
    success.searchParams.set('payment', 'success');
    success.searchParams.set('order', result.orderNumber || orderNumber);
    success.searchParams.set('tid', result.tid || '');
    success.searchParams.set('amount', String(result.amount || ''));
    redirectHtml(res, success.pathname + success.search);
  } catch (error) {
    redirectHtml(res, failUrl + '&message=' + encodeURIComponent(error.message));
  }
}

function readMainBannerData() {
  try { return JSON.parse(fs.readFileSync(mainBannerFile, 'utf8')); }
  catch (error) { return null; }
}

function writeMainBannerData(data) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(mainBannerFile, JSON.stringify(data, null, 2));
}


const defaultStoreSettings = {
  businessName: '현',
  kakaoChannelName: '띵베이프',
  kakaoChannelUrl: 'http://pf.kakao.com/_QyBAn',
  kakaoChatUrl: 'http://pf.kakao.com/_QyBAn/chat',
  senderName: '띵베이프',
  senderProfileId: '띵베이프',
  templateIds: ['1453539', '859460'],
  bankName: '카카오뱅크',
  bankAccount: '3333-24-7965978',
  accountHolder: '한명현',
  customerServicePhone: '010-5320-5322',
  courier: '로젠택배',
  testCustomerPhone: '010-5320-5322'
};

function readStoreSettings() {
  try {
    return { ...defaultStoreSettings, ...JSON.parse(fs.readFileSync(storeSettingsFile, 'utf8')) };
  } catch (error) {
    return { ...defaultStoreSettings };
  }
}

function cleanSetting(value, maxLength = 200) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeStoreSettings(payload) {
  const templateIds = Array.isArray(payload.templateIds)
    ? payload.templateIds
    : String(payload.templateIds || '').split(/[\s,]+/);
  return {
    businessName: cleanSetting(payload.businessName),
    kakaoChannelName: cleanSetting(payload.kakaoChannelName),
    kakaoChannelUrl: cleanSetting(payload.kakaoChannelUrl, 500),
    kakaoChatUrl: cleanSetting(payload.kakaoChatUrl, 500),
    senderName: cleanSetting(payload.senderName),
    senderProfileId: cleanSetting(payload.senderProfileId),
    templateIds: templateIds.map(value => cleanSetting(value, 100)).filter(Boolean).slice(0, 20),
    bankName: cleanSetting(payload.bankName),
    bankAccount: cleanSetting(payload.bankAccount),
    accountHolder: cleanSetting(payload.accountHolder),
    customerServicePhone: cleanSetting(payload.customerServicePhone),
    courier: cleanSetting(payload.courier),
    testCustomerPhone: cleanSetting(payload.testCustomerPhone)
  };
}

function alimtalkSecretStatus() {
  return {
    apiKey: !!alimtalkConfig.apiKey,
    businessKey: !!alimtalkConfig.businessKey,
    kakaoLoginKey: !!alimtalkConfig.kakaoLoginKey
  };
}

async function handleStoreSettings(req, res) {
  if (req.method === 'GET') {
    sendJson(res, 200, { settings: readStoreSettings(), secrets: alimtalkSecretStatus() });
    return;
  }
  if (req.method === 'POST') {
    const settings = normalizeStoreSettings(await readBody(req));
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(storeSettingsFile, JSON.stringify(settings, null, 2));
    sendJson(res, 200, { settings, secrets: alimtalkSecretStatus() });
    return;
  }
  sendJson(res, 405, { error: 'method_not_allowed' });
}

function isDataBannerImage(image) {
  return typeof image === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(image);
}

function isStoredBannerImage(image) {
  return typeof image === 'string' && (/^https?:\/\//i.test(image) || image.startsWith('/tthing/uploads/main-banners/'));
}

function validateBannerImage(image) {
  return isDataBannerImage(image) || isStoredBannerImage(image);
}

function normalizeBannerLink(link) {
  return String(link || '').trim().slice(0, 500);
}

function saveBannerImageFile(image, id) {
  if (!isDataBannerImage(image)) return image;
  const match = image.match(/^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/i);
  if (!match) return '';
  const ext = match[1].toLowerCase().replace('jpeg', 'jpg');
  const safeId = String(id || crypto.randomUUID()).replace(/[^0-9a-z_-]/gi, '').slice(0, 80) || crypto.randomUUID();
  const fileName = safeId + '-' + Date.now().toString(36) + '.' + ext;
  fs.mkdirSync(bannerUploadDir, { recursive: true });
  fs.writeFileSync(path.join(bannerUploadDir, fileName), Buffer.from(match[2], 'base64'));
  return '/tthing/uploads/main-banners/' + fileName;
}

function normalizeMainBannerData(data, options = {}) {
  if (!data) return { banners: [], updatedAt: '' };
  const source = Array.isArray(data.banners)
    ? data.banners
    : (data.image ? [{ id: data.id, image: data.image, link: data.link, updatedAt: data.updatedAt }] : []);
  const banners = source
    .filter(item => item && validateBannerImage(item.image))
    .slice(0, 50)
    .map((item, index) => {
      const id = String(item.id || ('banner-' + Date.now().toString(36) + '-' + index));
      const image = options.persistImages ? saveBannerImageFile(item.image, id) : item.image;
      return {
        id,
        image,
        link: normalizeBannerLink(item.link),
        updatedAt: item.updatedAt || data.updatedAt || ''
      };
    })
    .filter(item => validateBannerImage(item.image));
  return { banners, updatedAt: data.updatedAt || '' };
}

async function handleMainBanner(req, res) {
  if (req.method === 'GET') {
    sendJson(res, 200, normalizeMainBannerData(readMainBannerData()));
    return;
  }
  if (req.method === 'DELETE') {
    if (fs.existsSync(mainBannerFile)) fs.unlinkSync(mainBannerFile);
    sendJson(res, 200, { ok: true });
    return;
  }
  if (req.method === 'POST') {
    const payload = await readBody(req);
    const normalized = normalizeMainBannerData(payload, { persistImages: true });
    if (!normalized.banners.length) {
      sendJson(res, 400, { error: 'invalid_image' });
      return;
    }
    const saved = { banners: normalized.banners, updatedAt: new Date().toISOString() };
    writeMainBannerData(saved);
    sendJson(res, 200, saved);
    return;
  }
  sendJson(res, 405, { error: 'method_not_allowed' });
}

async function handleApi(req, res) {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/api/main-banner') return await handleMainBanner(req, res);
    if (pathname === '/api/store-settings') return await handleStoreSettings(req, res);
    if (req.method === 'GET' && pathname === '/api/kopay/status') return await handleKopayStatus(req, res);
    if (req.method === 'POST' && pathname === '/api/kopay/prepare') return await handleKopayPrepare(req, res);
    if ((req.method === 'GET' || req.method === 'POST') && pathname === '/api/kopay/return') return await handleKopayReturn(req, res);
    if (req.method === 'POST' && pathname === '/api/dream-auth/start') return await handleDreamAuthStart(req, res);
    if ((req.method === 'GET' || req.method === 'POST') && (pathname === '/api/dream-auth/request' || pathname === '/auth/mok/request')) return await handleDreamAuthRequest(req, res);
    if ((req.method === 'GET' || req.method === 'POST') && (pathname === '/api/dream-auth/result' || pathname === '/auth/mok/result')) return await handleDreamAuthResult(req, res);
    if (req.method === 'POST' && pathname === '/api/dream-auth/verify') return await handleDreamAuthVerify(req, res);
    sendJson(res, 404, { error: 'not_found' });
  } catch (error) {
    sendJson(res, 500, { error: 'server_error', message: error.message });
  }
}

function isBlockedStaticPath(filePath) {
  const relative = path.relative(root, filePath).replace(/\\/g, '/');
  if (!relative || relative.startsWith('..')) return true;
  if (relative.startsWith('.')) return true;
  if (/^(dev_keys|prod_keys|dreamsecurity|WEB-INF)(\/|$)/.test(relative)) return true;
  if (/(^|\/)mok_keyInfo\.dat$/i.test(relative)) return true;
  if (/\.(zip|jar|jsp)$/i.test(relative)) return true;
  if (/\.env(\.|$)?/i.test(relative)) return true;
  return false;
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const requested = path.normalize(path.join(root, urlPath === '/' ? '/tthing/index.html' : urlPath));
  if (!requested.startsWith(root) || isBlockedStaticPath(requested)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(requested, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(requested).toLowerCase();
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/') || req.url.startsWith('/auth/mok/')) return handleApi(req, res);
  serveStatic(req, res);
});

server.listen(port, () => {
  console.log('TTHING server running at http://localhost:' + port + '/tthing/index.html');
  console.log('DreamSecurity auth mode:', mode);
});
