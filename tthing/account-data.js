(function(){
  const SESSION_KEY = "tthingCustomerSession";
  const RECENT_KEY = "tthingRecentProducts";
  const readJson = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || "null") || fallback; } catch (error) { return fallback; } };
  const writeJson = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const session = readJson(SESSION_KEY, null);
  const userId = session && session.authenticated && session.user ? session.user : "";
  const customerKey = userId ? "tthingCustomerDetail:" + userId : "";
  const wishlistKey = "tthingWishlistProducts:" + (userId || "guest");
  const couponKey = userId ? "tthingCustomerCoupons:" + userId : "";
  const money = (value) => Number(value || 0).toLocaleString("ko-KR") + "원";
  const dateText = (value) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? String(value || "-") : date.toLocaleDateString("ko-KR"); };
  const escapeHtml = (value) => String(value || "").replace(/[&<>\"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[char]));

  function ensureWelcomeBenefits(){
    if (!userId) return null;
    const saved = readJson(customerKey, {});
    const log = Array.isArray(saved.pointLog) ? saved.pointLog.slice() : [];
    const hasWelcome = log.some((item) => item && item.benefitId === "signup-3000");
    const isSignupMember = session.provider === "signup";
    const basePoints = Number(saved.points ?? session.points ?? 0);
    const next = { ...saved };
    if (!hasWelcome && isSignupMember) {
      next.points = basePoints + 3000;
      log.unshift({ date:new Date().toISOString().slice(0,10), type:"추가", amount:3000, reason:"신규회원 가입 적립금", benefitId:"signup-3000" });
    } else next.points = basePoints;
    next.pointLog = log;
    writeJson(customerKey, next);
    writeJson(SESSION_KEY, { ...session, points: next.points });
    const coupons = readJson(couponKey, []);
    if (isSignupMember && !coupons.some((coupon) => coupon && coupon.id === "welcome-10")) {
      const issued = new Date();
      const expires = new Date(issued);
      expires.setDate(expires.getDate() + 30);
      coupons.unshift({ id:"welcome-10", name:"신규회원 10% 할인 쿠폰", type:"percent", value:10, minOrder:20000, maxDiscount:5000, issuedAt:issued.toISOString(), expiresAt:expires.toISOString(), used:false });
      writeJson(couponKey, coupons);
    }
    return next;
  }

  function productCards(items, removable){
    if (!items.length) return `<div class="account-empty"><strong>표시할 상품이 없습니다.</strong><span>상품 상세페이지에서 상품을 확인하거나 관심상품으로 추가해 주세요.</span></div>`;
    return `<div class="account-products">${items.map((item) => `<article class="account-product"><a href="${escapeHtml(item.href || ("product-detail.html?product=" + encodeURIComponent(item.code || "")))}"><div class="account-thumb">${item.image ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}">` : ""}</div><strong>${escapeHtml(item.name || item.code)}</strong><span class="account-price">${escapeHtml(item.price || "가격 확인")}</span></a>${removable ? `<button type="button" data-remove-wishlist="${escapeHtml(item.code)}">삭제</button>` : `<small>${dateText(item.viewedAt)}</small>`}</article>`).join("")}</div>`;
  }

  function renderRecent(){
    const root = document.getElementById("accountContent");
    if (!root) return;
    const items = readJson(RECENT_KEY, []).filter((item) => item && item.code).slice(0, 24);
    root.innerHTML = productCards(items, false);
  }

  function renderWishlist(){
    const root = document.getElementById("accountContent");
    if (!root) return;
    if (userId) {
      const guest = readJson("tthingWishlistProducts:guest", []);
      if (guest.length) {
        const own = readJson(wishlistKey, []);
        const merged = [...guest, ...own].filter((item, index, list) => item && item.code && list.findIndex((other) => other.code === item.code) === index);
        writeJson(wishlistKey, merged);
        localStorage.removeItem("tthingWishlistProducts:guest");
      }
    }
    const items = readJson(wishlistKey, []).filter((item) => item && item.code);
    root.innerHTML = productCards(items, true);
    root.querySelectorAll("[data-remove-wishlist]").forEach((button) => button.addEventListener("click", () => {
      writeJson(wishlistKey, readJson(wishlistKey, []).filter((item) => item.code !== button.dataset.removeWishlist));
      renderWishlist();
    }));
  }

  function renderMileage(){
    const root = document.getElementById("accountContent");
    if (!root) return;
    if (!userId) {
      root.innerHTML = `<div class="account-empty"><strong>로그인이 필요합니다.</strong><a href="login.html?next=mileage.html">로그인</a></div>`;
      return;
    }
    const detail = ensureWelcomeBenefits() || {};
    const log = Array.isArray(detail.pointLog) ? detail.pointLog.slice().reverse() : [];
    const earned = log.filter((item) => item.type !== "차감").reduce((sum,item) => sum + Number(item.amount || 0), 0);
    const used = log.filter((item) => item.type === "차감").reduce((sum,item) => sum + Number(item.amount || 0), 0);
    root.innerHTML = `<div class="account-summary"><div><span>사용 가능 적립금</span><strong>${money(detail.points)}</strong></div><div><span>총 적립</span><strong>${money(earned)}</strong></div><div><span>총 사용</span><strong>${money(used)}</strong></div></div><div class="account-table"><div class="account-row account-head"><span>날짜</span><span>내용</span><span>금액</span></div>${log.length ? log.map((item) => `<div class="account-row"><span>${escapeHtml(item.date)}</span><span>${escapeHtml(item.reason)}</span><strong class="${item.type === "차감" ? "minus" : "plus"}">${item.type === "차감" ? "-" : "+"}${money(item.amount)}</strong></div>`).join("") : `<div class="account-empty"><span>적립금 내역이 없습니다.</span></div>`}</div><p class="account-note">구매 시 적립금 사용액을 제외한 상품금액의 2%가 자동 적립됩니다.</p>`;
  }

  function renderCoupons(){
    const root = document.getElementById("accountContent");
    if (!root) return;
    if (!userId) {
      root.innerHTML = `<div class="account-empty"><strong>로그인이 필요합니다.</strong><a href="login.html?next=coupons.html">로그인</a></div>`;
      return;
    }
    ensureWelcomeBenefits();
    const now = Date.now();
    const coupons = readJson(couponKey, []);
    root.innerHTML = coupons.length ? `<div class="coupon-list">${coupons.map((coupon) => { const expired = new Date(coupon.expiresAt).getTime() < now; const status = coupon.used ? "사용완료" : expired ? "기간만료" : "사용가능"; return `<article class="coupon-card ${coupon.used || expired ? "disabled" : ""}"><span class="coupon-status">${status}</span><h3>${escapeHtml(coupon.name)}</h3><strong>${coupon.type === "percent" ? coupon.value + "% 할인" : money(coupon.value)}</strong><p>${money(coupon.minOrder)} 이상 구매 시 · 최대 ${money(coupon.maxDiscount)} 할인</p><small>${dateText(coupon.issuedAt)} 발급 · ${dateText(coupon.expiresAt)}까지</small></article>`; }).join("")}</div>` : `<div class="account-empty"><strong>보유 쿠폰이 없습니다.</strong></div>`;
  }

  const page = document.body.dataset.accountPage;
  if (page === "recent") renderRecent();
  if (page === "wishlist") renderWishlist();
  if (page === "mileage") renderMileage();
  if (page === "coupons") renderCoupons();
})();
