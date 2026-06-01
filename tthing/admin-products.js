(function () {
  const STORAGE_KEY = "tthingAdminProducts";
  const UPDATED_KEY = "tthingAdminProductsUpdatedAt";
  const DELETED_KEY = "tthingDeletedProductCodes";
  const ADMIN_PRODUCT_URLS = ["/tthingadmin/product.html", "/product.html"];
  const esc = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
  const won = (value) => {
    if (typeof value === "string" && value.includes("원")) return value;
    const number = Number(String(value || "0").replace(/[^0-9.-]/g, "")) || 0;
    return number.toLocaleString("ko-KR") + "원";
  };
  const toNumber = (value) => Number(String(value || "0").replace(/[^0-9.-]/g, "")) || 0;
  const compact = (value) => String(value || "").replace(/\s+/g, "");

  function migrateLegacyCustomerProducts() {
    try {
      const legacy = JSON.parse(localStorage.getItem("tthingCustomerProducts") || "{}");
      if (!legacy || !Object.keys(legacy).length) return;
      const deleted = new Set(JSON.parse(localStorage.getItem(DELETED_KEY) || "[]"));
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      let changed = false;
      Object.values(legacy).forEach((item) => {
        if (!item || !item.code || deleted.has(item.code) || saved[item.code]) return;
        saved[item.code] = item;
        changed = true;
      });
      if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      localStorage.removeItem("tthingCustomerProducts");
    } catch (error) {}
  }

  function readSavedMap() {
    migrateLegacyCustomerProducts();
    const deleted = new Set(JSON.parse(localStorage.getItem(DELETED_KEY) || "[]"));
    const merged = {};
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      Object.keys(saved).forEach((code) => {
        const item = saved[code] || {};
        if (/^live-/.test(code) || item.origin === "tthing.store" || deleted.has(code)) return;
        merged[code] = item;
      });
    } catch (error) {}
    return merged;
  }

  function normalizeSavedProduct(item) {
    const price = item.salePrice || item.discountPrice || item.price || "0원";
    const image = (item.productImages && item.productImages[0]) || (item.images && item.images[0]) || "";
    const category = item.category || (item.categories && item.categories[0]) || "";
    return {
      raw: item,
      code: item.code,
      name: item.name || "관리자 등록 상품",
      desc: item.summary || item.simple || item.desc || category || "관리자 등록 상품",
      origin: item.origin || "",
      price,
      unit: item.saleUnit || item.discountUnit || item.unit || toNumber(price),
      image,
      category,
      categories: item.categories && item.categories.length ? item.categories : [category].filter(Boolean),
      badge: item.discountEnabled ? "SALE" : "NEW",
      updatedAt: item.updatedAt || "",
      fromSaved: true
    };
  }

  function normalizeAdminRow(item) {
    const price = won(item.sale || item.price || item.unit || 0);
    const category = item.category || "";
    return {
      raw: item,
      code: item.code,
      name: item.name || item.code || "관리자 상품",
      desc: item.option || item.summary || item.desc || category || "관리자 상품",
      origin: item.origin || "",
      price,
      unit: toNumber(item.sale || item.price || item.unit),
      image: item.img || (item.productImages && item.productImages[0]) || (item.images && item.images[0]) || "",
      category,
      categories: [category].filter(Boolean),
      badge: String(category).includes("타임세일") ? "SALE" : "ITEM",
      updatedAt: item.updatedAt || "",
      fromAdminList: true
    };
  }

  function normalizeImportedProduct(item) {
    const rawPrice = item.salePrice || item.priceText || item.price || item.sale || item.unit || 0;
    const price = won(rawPrice);
    const category = item.category || (item.categories && item.categories[0]) || "";
    const image = (item.productImages && item.productImages[0]) || (item.images && item.images[0]) || item.img || "";
    const categories = Array.isArray(item.categories) && item.categories.length ? item.categories : [category].filter(Boolean);
    return {
      raw: item,
      code: item.code,
      name: item.name || item.title || "띵베이프 상품",
      desc: item.summary || item.simple || item.desc || category || "띵베이프 상품",
      origin: item.origin || "tthing.store",
      price,
      unit: item.saleUnit || item.unit || item.sale || item.price || toNumber(rawPrice),
      image,
      category,
      categories,
      badge: item.badge || (compact(category).includes("타임세일") ? "SALE" : "ITEM"),
      updatedAt: item.updatedAt || "",
      fromImported: true
    };
  }

  function productForDetail(item) {
    const raw = item.raw || {};
    const productImages = raw.productImages && raw.productImages.length ? raw.productImages : (item.image ? [item.image] : []);
    const detailImages = raw.detailImages && raw.detailImages.length ? raw.detailImages : productImages;
    const detailHtml = raw.detailHtml || (detailImages.length ? detailImages.map((src) => '<p><img class="detail-image" src="' + esc(src) + '" alt="' + esc(item.name) + '"></p>').join('') : "");
    return {
      code: item.code,
      name: item.name,
      summary: item.desc,
      simple: item.desc,
      desc: item.desc,
      category: item.category,
      categories: item.categories,
      display: "T",
      selling: "T",
      price: item.price,
      unit: item.unit,
      salePrice: item.price,
      saleUnit: item.unit,
      optionUse: false,
      options: ["기본상품"],
      optionItems: [{ name: "기본상품", addPrice: 0, stock: 999, status: "판매함" }],
      productImages,
      images: productImages,
      detailImages,
      detailHtml,
      seo: { open: true, title: item.name, description: item.desc, keywords: [item.name, item.category].filter(Boolean).join(", ") },
      updatedAt: item.updatedAt || new Date().toISOString()
    };
  }

  function syncDetailProducts(products) {
    const saved = readSavedMap();
    let changed = false;
    products.forEach((item) => {
      if (!item.code || saved[item.code]) return;
      saved[item.code] = productForDetail(item);
      changed = true;
    });
    if (changed) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      localStorage.setItem(UPDATED_KEY, String(Date.now()));
    }
  }

  async function fetchAdminListProducts() {
    for (const url of ADMIN_PRODUCT_URLS) {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) continue;
        const html = await response.text();
        const match = html.match(/const products\s*=\s*(\[[\s\S]*?\])\s*;/) || html.match(/const products\s*=\s*(\[[\s\S]*?\])\s*,\s*comma=/);
        if (!match) continue;
        return Function("return " + match[1])().filter((item) => item && item.code && item.display !== "F" && item.selling !== "F").map(normalizeAdminRow);
      } catch (error) {}
    }
    return [];
  }

  async function collectProducts() {
    const deletedCodes = new Set(JSON.parse(localStorage.getItem("tthingDeletedProductCodes") || "[]"));
    
    const savedProducts = Object.values(readSavedMap())
      .filter((item) => item && item.code && item.display !== "F" && item.selling !== "F" && !deletedCodes.has(item.code))
      .map(normalizeSavedProduct);
      
    const adminListProducts = (await fetchAdminListProducts())
      .filter(item => !deletedCodes.has(item.code));

    const importedProducts = Array.isArray(window.TTHING_IMPORTED_PRODUCTS)
      ? window.TTHING_IMPORTED_PRODUCTS.filter((item) => item && item.code && !deletedCodes.has(item.code)).map(normalizeImportedProduct)
      : [];

    const merged = new Map();
    
    // 1. 관리자 상품 목록 (adminListProducts) 먼저 추가
    adminListProducts.forEach((item) => merged.set(item.code, item));
    
    // 2. 저장된 상품 (savedProducts - 직접 등록/수정된 상품) 추가 (덮어쓰기)
    savedProducts.forEach((item) => merged.set(item.code, item));
    
    // 3. 만약 관리자 목록이나 저장된 목록에 없는 '순수' 외부 상품은 제외하길 원하므로,
    // importedProducts 중 이미 merged에 존재하는 것들만 정보를 병합합니다.
    importedProducts.forEach((item) => {
      const existing = merged.get(item.code);
      if (existing) {
        merged.set(item.code, {
          ...existing,
          category: existing.category || item.category,
          categories: Array.from(new Set([...(existing.categories || []), ...(item.categories || [])])).filter(Boolean),
          desc: existing.desc || item.desc,
          origin: existing.origin || item.origin,
          image: existing.image || item.image,
          badge: existing.badge || item.badge,
          updatedAt: existing.updatedAt || item.updatedAt,
          raw: { ...(existing.raw || {}), ...(item.raw || {}) }
        });
      }
      // else: 관리자 홈에 없는 상품이면 무시 (고객홈 노출 제외)
    });

    const products = [...merged.values()].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    return products;
  }

  function productCard(item) {
    const origin = item.origin ? '<span class="origin">' + esc(item.origin) + '</span>' : "";
    const image = item.image ? '<img src="' + esc(item.image) + '" alt="' + esc(item.name) + '" loading="lazy" onerror="this.closest(\'.thumb\').classList.add(\'is-missing\')">' : "";
    return '<a class="product admin-product" data-admin-product="true" href="product-detail.html?product=' + encodeURIComponent(item.code) + '"><div class="thumb has-img" data-badge="' + esc(item.badge) + '">' + image + '</div><h3>' + esc(item.name) + '</h3><div class="desc">' + esc(item.desc) + '</div><div class="price-line">' + origin + '<span class="price">' + esc(item.price) + '</span></div></a>';
  }

  function saleCard(item) {
    const image = item.image ? '<img src="' + esc(item.image) + '" alt="' + esc(item.name) + '" loading="lazy" onerror="this.style.display=\'none\'">' : "";
    return '<a class="sale-product admin-product" data-admin-product="true" href="product-detail.html?product=' + encodeURIComponent(item.code) + '"><div class="sale-thumb">' + image + '<span class="sale-label">TIME SALE</span></div><h3>' + esc(item.name) + '</h3><div class="price-line"><span class="price">' + esc(item.price) + '</span></div></a>';
  }

  function matchesPage(item, page) {
    const cats = (item.categories || []).map(compact).join(" ");
    const cat = compact(item.category || "");
    const name = compact(item.name || "");
    const combined = (cats + " " + cat + " " + name).toLowerCase();
    
    if (page === "liquid") return /액상|입호흡|폐호흡|liquid/i.test(combined);
    if (page === "disposable") return /일회용전자담배|일회용|disposable/i.test(combined);
    if (page === "device") return /기기|기체|device|kit|킷/i.test(combined);
    if (page === "supply") return /소모품|코일|팟|supply|coil|pod|cartridge/i.test(combined);
    if (page === "best") return /베스트|best|인기/i.test(combined) || (item.raw && item.raw.mainDisplay && item.raw.mainDisplay.includes("추천"));
    if (page === "new") return true; // 신상은 전체 노출
    if (page === "timesale") return /타임세일|timesale|sale|세일/i.test(combined) || item.badge === "SALE" || (item.raw && item.raw.discountEnabled);
    return true;
  }

  function blockForCategory(item) {
    const category = compact(item.category || "");
    const name = compact(item.name || "");
    const combined = (category + " " + name).toLowerCase();
    
    const map = [
      [/무니코틴입호흡|zero.*mtl/i, "zero-mtl"], 
      [/무니코틴폐호흡|zero.*dtl/i, "zero-dtl"], 
      [/입호흡|mtl/i, "mtl"], 
      [/폐호흡|dtl/i, "dtl"], 
      [/무니코틴일회용/i, "zero"], 
      [/일회용/i, "normal"], 
      [/코일|coil/i, "coil"], 
      [/팟|pod|카트리지|cartridge/i, "pod"]
    ];
    const found = map.find(([pattern]) => pattern.test(combined));
    return found ? document.getElementById(found[1]) : null;
  }

  function appendBatch(container, products, limit = 100) {
    if (!container) return;
    const existingCodes = new Set([...container.querySelectorAll('a[href*="product="]')].map(link => {
      try { return new URL(link.getAttribute("href"), location.href).searchParams.get("product"); }
      catch (e) { return null; }
    }).filter(Boolean));
    
    let html = "";
    let added = 0;
    products.forEach(item => {
      if (added >= limit) return;
      if (!existingCodes.has(item.code)) {
        html += (location.pathname.includes("timesale") ? saleCard(item) : productCard(item));
        added++;
      }
    });
    if (html) container.insertAdjacentHTML("afterbegin", html);
  }

  function renderCategoryPage(page, products) {
    const pageProducts = products.filter((item) => matchesPage(item, page));
    const groups = {};
    
    pageProducts.forEach((item) => {
      const block = blockForCategory(item);
      const id = block ? block.id : "default";
      if (!groups[id]) groups[id] = [];
      groups[id].push(item);
    });

    Object.keys(groups).forEach(id => {
      let container = null;
      if (id !== "default") {
        const block = document.getElementById(id);
        container = block ? block.querySelector(".products") : null;
      }
      
      // 만약 특정 블록을 못 찾았거나 id가 default면 첫 번째 가능한 컨테이너에 넣습니다.
      if (!container) {
        container = document.querySelector(".category-block .products") || document.querySelector(".products");
      }

      if (container) appendBatch(container, groups[id], 150);
    });
  }

  function renderSimpleList(page, products) {
    const container = document.querySelector(".timesale-products") || document.querySelector(".products") || document.querySelector("main .products") || document.querySelector("main");
    const filtered = products.filter((item) => matchesPage(item, page));
    appendBatch(container, filtered, 200);
  }

  function renderAdminSection(products) {
    if (!products.length) return;
    let section = document.getElementById("adminRegisteredProductsSection");
    if (!section) {
      const popular = document.getElementById("popularProducts");
      section = document.createElement("section");
      section.id = "adminRegisteredProductsSection";
      section.className = "wrap";
      section.innerHTML = '<div class="section-head"><div><p>ADMIN</p><h2>관리자 등록상품</h2></div></div><div class="products" id="adminRegisteredProducts"></div>';
      const anchor = popular ? popular.closest("section") : null;
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(section, anchor);
      else {
        const main = document.querySelector("main");
        if (main) main.appendChild(section);
      }
    }
    const container = document.getElementById("adminRegisteredProducts");
    if (container) appendBatch(container, products.slice().reverse(), 80);
  }

  function renderMain(products) {
    const popular = document.getElementById("popularProducts");
    const newest = document.getElementById("newProducts");
    const timesale = document.getElementById("timesaleProducts");
    
    const saved = products.filter((item) => item.fromSaved);
    renderAdminSection(saved);

    const mainProducts = [...products].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    
    if (popular) appendBatch(popular, mainProducts.slice(0, 20), 12);
    if (newest) appendBatch(newest, mainProducts, 80);
    if (timesale) {
      const saleProducts = mainProducts.filter((item) => matchesPage(item, "timesale"));
      const saleHtml = saleProducts.slice(0, 20).map(saleCard).join("");
      timesale.insertAdjacentHTML("afterbegin", saleHtml);
    }
  }

  async function run() {
    const products = await collectProducts();
    console.log("띵베이프 상품 로드 완료:", products.length, "건");
    if (!products.length) return;
    
    const page = location.pathname.split("/").pop().replace(".html", "") || "index";
    console.log("현재 페이지:", page);
    
    if (page === "index" || page === "diliquid-shop") renderMain(products);
    else if (["liquid", "disposable", "device", "supply"].includes(page)) renderCategoryPage(page, products);
    else if (["best", "new", "timesale"].includes(page)) renderSimpleList(page, products);
  }

  function refresh() {
    document.querySelectorAll(".admin-product[data-admin-product=\"true\"]").forEach((node) => node.remove());
    run();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY || event.key === DELETED_KEY || event.key === UPDATED_KEY) refresh();
  });
})();
