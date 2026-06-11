(function () {
  const STORAGE_KEY = "tthingAdminProducts";
  const UPDATED_KEY = "tthingAdminProductsUpdatedAt";
  const DELETED_KEY = "tthingDeletedProductCodes";
  const ADMIN_PRODUCT_URLS = ["/tthingadmin/product.html", "/product.html"];
  const RECENT_KEY = "tthingRecentProducts";
  const PAGE_SIZE = 40;
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

  function readDeletedCodes() {
    try {
      return new Set(JSON.parse(localStorage.getItem(DELETED_KEY) || "[]"));
    } catch (error) {
      return new Set();
    }
  }

  function isCustomerLoggedIn() {
    try {
      const session = JSON.parse(localStorage.getItem("tthingCustomerSession") || "null");
      return !!(session && session.authenticated);
    } catch (error) {
      return false;
    }
  }

  function canShowByExposure(item) {
    return !item || item.exposure !== "member" || isCustomerLoggedIn();
  }

  function readHiddenDisplayCodes() {
    const hidden = new Set();
    const imported = Array.isArray(window.TTHING_IMPORTED_PRODUCTS) ? window.TTHING_IMPORTED_PRODUCTS : [];
    imported.forEach((item) => {
      if (item && item.code && item.display === "F") hidden.add(item.code);
    });
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      Object.values(saved).forEach((item) => {
        if (!item || !item.code) return;
        if (item.display === "F") hidden.add(item.code);
        else hidden.delete(item.code);
      });
    } catch (error) {}
    return hidden;
  }

  function removeHiddenProductCards() {
    const deleted = readDeletedCodes();
    const hidden = readHiddenDisplayCodes();
    if (!deleted.size && !hidden.size) return;
    document.querySelectorAll('a[href*="product-detail.html?product="], a[data-code]').forEach((link) => {
      let code = link.dataset.code || "";
      if (!code) {
        try {
          code = new URL(link.getAttribute("href"), location.href).searchParams.get("product") || "";
        } catch (error) {}
      }
      if (!deleted.has(code) && !hidden.has(code)) return;
      const card = link.closest(".product, .sale-product, .admin-product");
      (card || link).remove();
    });
  }

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
      display: item.display || "T",
      selling: item.selling || "T",
      exposure: item.exposure || "all",
      badge: (Array.isArray(item.mainDisplay) && item.mainDisplay.includes("timesale")) || item.discountEnabled ? "SALE" : "NEW",
      mainDisplay: Array.isArray(item.mainDisplay) ? item.mainDisplay : [],
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
      display: item.display || "T",
      selling: item.selling || "T",
      exposure: item.exposure || "all",
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
      display: item.display || "T",
      selling: item.selling || "T",
      exposure: item.exposure || "all",
      badge: item.badge || (compact(category).includes("타임세일") ? "SALE" : "ITEM"),
      updatedAt: item.updatedAt || "",
      fromImported: true
    };
  }

  function productSeoKeywords(item) {
    const raw = item.raw || {};
    const options = Array.isArray(raw.options) ? raw.options : [];
    return [...new Set([
      item.name,
      item.category,
      ...(item.categories || []),
      ...options.slice(0, 12),
      "무니코틴 일회용전자담배",
      "일반 일회용전자담배",
      "일회용전자담배",
      "일회용 전자담배",
      "무니코틴 일회용",
      "일반 일회용",
      "입호흡액상",
      "무니코틴액상",
      "무니코틴 액상",
      "입호흡 액상",
      "폐호흡 액상",
      "전자담배 액상",
      "띵베이프"
    ].filter(Boolean).map((value) => String(value).trim()).filter(Boolean))].join(", ");
  }

  function productSeoDescription(item) {
    return item.desc || `${item.name} 상품 상세정보, 가격, 옵션과 구매 정보를 띵베이프에서 확인하세요.`;
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
      display: raw.display || item.display || "T",
      selling: raw.selling || item.selling || "T",
      exposure: raw.exposure || item.exposure || "all",
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
      seo: { open: true, title: `${item.name} - 띵베이프`, description: productSeoDescription(item), keywords: productSeoKeywords(item), searchKeywords: productSeoKeywords(item), imageAlt: `${item.name} 상품 이미지` },
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
        return Function("return " + match[1])().filter((item) => item && item.code && item.display !== "F" && item.selling !== "F" && canShowByExposure(item)).map(normalizeAdminRow);
      } catch (error) {}
    }
    return [];
  }

  async function loadImportedProducts() {
    if (Array.isArray(window.TTHING_IMPORTED_PRODUCTS) && window.TTHING_IMPORTED_PRODUCTS.length) {
      return window.TTHING_IMPORTED_PRODUCTS;
    }
    try {
      const response = await fetch('tthing-products.json', { cache: 'no-store' });
      if (!response.ok) return [];
      const products = await response.json();
      return Array.isArray(products) ? products : [];
    } catch (error) {
      console.error('상품 데이터를 불러오지 못했습니다.', error);
      return [];
    }
  }

  async function collectProducts() {
    const deletedCodes = readDeletedCodes();
    
    const savedProducts = Object.values(readSavedMap())
      .filter((item) => item && item.code && !deletedCodes.has(item.code) && canShowByExposure(item))
      .map(normalizeSavedProduct);
      
    const adminListProducts = (await fetchAdminListProducts())
      .filter(item => !deletedCodes.has(item.code));

    const importedSource = await loadImportedProducts();
    const importedProducts = importedSource
      .filter((item) => item && item.code && !deletedCodes.has(item.code) && canShowByExposure(item))
      .map(normalizeImportedProduct);

    const merged = new Map();

    importedProducts.forEach((item) => merged.set(item.code, item));
    adminListProducts.forEach((item) => merged.set(item.code, { ...(merged.get(item.code) || {}), ...item }));
    savedProducts.forEach((item) => merged.set(item.code, { ...(merged.get(item.code) || {}), ...item }));

    const products = [...merged.values()]
      .filter((item) => item.display !== "F" && item.selling !== "F" && canShowByExposure(item))
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    return products;
  }

  function productCard(item) {
    const origin = item.origin ? '<span class="origin">' + esc(item.origin) + '</span>' : "";
    const image = item.image ? '<img src="' + esc(item.image) + '" alt="' + esc(item.name) + '" loading="lazy" onerror="this.closest(\'.thumb\').classList.add(\'is-missing\')">' : "";
    return '<a class="product admin-product" data-admin-product="true" data-code="' + esc(item.code) + '" data-name="' + esc(item.name) + '" data-image="' + esc(item.image) + '" data-price="' + esc(item.price) + '" href="product-detail.html?product=' + encodeURIComponent(item.code) + '"><div class="thumb has-img" data-badge="' + esc(item.badge) + '">' + image + '</div><h3>' + esc(item.name) + '</h3><div class="desc">' + esc(item.desc) + '</div><div class="price-line">' + origin + '<span class="price">' + esc(item.price) + '</span></div></a>';
  }

  function saleCard(item) {
    const image = item.image ? '<img src="' + esc(item.image) + '" alt="' + esc(item.name) + '" loading="lazy" onerror="this.style.display=\'none\'">' : "";
    return '<a class="sale-product admin-product" data-admin-product="true" data-code="' + esc(item.code) + '" data-name="' + esc(item.name) + '" data-image="' + esc(item.image) + '" data-price="' + esc(item.price) + '" href="product-detail.html?product=' + encodeURIComponent(item.code) + '"><div class="sale-thumb">' + image + '<span class="sale-label">TIME SALE</span></div><h3>' + esc(item.name) + '</h3><div class="price-line"><span class="price">' + esc(item.price) + '</span></div></a>';
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
    if (page === "best") return /베스트|best|인기/i.test(combined) || (item.raw && item.raw.mainDisplay && (item.raw.mainDisplay.includes("popular") || item.raw.mainDisplay.includes("추천")));
    if (page === "new") return true; // 신상은 전체 노출
    if (page === "timesale") return /타임세일|timesale|sale|세일/i.test(combined) || item.badge === "SALE" || (item.raw && item.raw.mainDisplay && item.raw.mainDisplay.includes("timesale")) || (item.raw && item.raw.discountEnabled);
    return true;
  }

  function blockForCategory(item, page) {
    const category = compact(item.category || "");
    const name = compact(item.name || "");
    const combined = (category + " " + name).toLowerCase();

    const maps = {
      liquid: [[/무니코틴|zero/i, "zero"], [/입호흡|mtl/i, "mtl"], [/폐호흡|dtl/i, "dtl"]],
      disposable: [[/무니코틴|zero/i, "zero"], [/일회용|disposable/i, "normal"]],
      supply: [[/코일|coil/i, "coil"], [/팟|pod|카트리지|cartridge/i, "pod"]]
    };
    const found = (maps[page] || []).find(([pattern]) => pattern.test(combined));
    return found ? found[1] : "";
  }

  function appendBatch(container, products, limit = Infinity) {
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


  function pageStorageKey(key) {
    return "tthingProductPage:" + location.pathname + ":" + key;
  }

  function ensurePagerStyle() {
    if (document.getElementById("tthingProductPagerStyle")) return;
    const style = document.createElement("style");
    style.id = "tthingProductPagerStyle";
    style.textContent = '.tthing-product-pager{display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap;margin:28px 0 38px}.tthing-product-pager button{min-width:36px;min-height:36px;border:1px solid var(--line,#e8e5df);border-radius:8px;background:#fff;color:inherit;font-weight:900;cursor:pointer}.tthing-product-pager button.active{background:#171717;color:#fff;border-color:#171717}.tthing-product-pager button:disabled{opacity:.42;cursor:not-allowed}.tthing-product-pager span{padding:0 4px;color:var(--sub,#777);font-weight:900}.tthing-subhead-tools{display:flex;align-items:center;justify-content:flex-end;gap:12px;flex-wrap:wrap}.tthing-page-size{display:inline-flex!important;align-items:center;gap:6px;margin:0;font-size:13px;font-weight:900;color:var(--sub,#777);white-space:nowrap}.tthing-page-size select{height:36px;border:1px solid var(--line,#e8e5df);border-radius:8px;background:#fff;padding:0 9px;font:inherit;font-weight:900}.tthing-page-count{margin-left:8px}.tthing-list-subhead{margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--line,#e8e5df);display:flex;align-items:center;justify-content:space-between;gap:14px}.tthing-list-subhead h2{margin:0;font-size:25px}.tthing-list-subhead>span{color:var(--sub,#777);font-size:13px}@media(max-width:680px){.tthing-subhead-tools,.tthing-list-subhead{align-items:flex-start;flex-direction:column}.tthing-page-size{margin-top:2px}}';
    document.head.appendChild(style);
  }

  function ensurePageSizeControl(container, pageSize, sizeOptions, onChange) {
    let subhead = container.closest(".category-block")?.querySelector(":scope > .category-subhead");
    if (!subhead) {
      const main = container.closest("main") || document.querySelector("main");
      if (!main) return;
      subhead = main.querySelector(":scope > .tthing-list-subhead");
      if (!subhead) {
        const pageTitle = document.querySelector(".page-hero h1")?.textContent.trim() || "상품";
        subhead = document.createElement("div");
        subhead.className = "tthing-list-subhead";
        subhead.innerHTML = '<h2>' + esc(pageTitle) + ' 상품</h2><span>선택한 카테고리의 상품을 표시합니다.</span>';
        const anchor = container.closest(".timesale-layout") || container;
        anchor.insertAdjacentElement("beforebegin", subhead);
      }
    }
    let tools = subhead.querySelector(".tthing-subhead-tools");
    if (!tools) {
      const guide = subhead.querySelector(":scope > span");
      tools = document.createElement("div");
      tools.className = "tthing-subhead-tools";
      if (guide) tools.appendChild(guide);
      subhead.appendChild(tools);
    }
    tools.querySelector(".tthing-page-size")?.remove();
    const label = document.createElement("label");
    label.className = "tthing-page-size";
    label.innerHTML = '<span>페이지당</span><select aria-label="페이지당 상품 수">' + sizeOptions.map((size) => '<option value="' + size + '"' + (size === pageSize ? ' selected' : '') + '>' + size + '개보기</option>').join("") + '</select>';
    tools.appendChild(label);
    label.querySelector("select").addEventListener("change", (event) => onChange(Number(event.target.value) || sizeOptions[0]));
  }

  function renderPagedContainer(container, products, key) {
    if (!container) return;
    const storageKey = pageStorageKey(key);
    const sizeKey = pageStorageKey("size");
    const sizeOptions = [20, 30, 50];
    let pageSize = Number(sessionStorage.getItem(sizeKey)) || sizeOptions[0];
    if (!sizeOptions.includes(pageSize)) pageSize = sizeOptions[0];
    let currentPage = Math.max(1, Number(sessionStorage.getItem(storageKey) || 1));
    const render = () => {
      const totalPages = Math.max(1, Math.ceil(products.length / pageSize));
      currentPage = Math.min(totalPages, Math.max(1, currentPage));
      sessionStorage.setItem(storageKey, String(currentPage));
      sessionStorage.setItem(sizeKey, String(pageSize));
      container.querySelectorAll('.admin-product[data-admin-product="true"]').forEach((node) => node.remove());
      const start = (currentPage - 1) * pageSize;
      const html = products.slice(start, start + pageSize).map((item) => location.pathname.includes("timesale") ? saleCard(item) : productCard(item)).join("");
      container.insertAdjacentHTML("afterbegin", html);
      let pager = container.nextElementSibling;
      if (!pager || !pager.classList.contains("tthing-product-pager")) {
        pager = document.createElement("nav");
        pager.className = "tthing-product-pager";
        container.insertAdjacentElement("afterend", pager);
      }
      ensurePageSizeControl(container, pageSize, sizeOptions, (nextSize) => {
        pageSize = nextSize;
        currentPage = 1;
        render();
      });
      const pageText = '<span class="tthing-page-count">' + currentPage + ' / ' + totalPages + ' 페이지</span>';
      if (totalPages <= 1) {
        pager.innerHTML = pageText;
      } else {
        const buttons = [];
        buttons.push('<button type="button" data-page="' + Math.max(1, currentPage - 1) + '"' + (currentPage === 1 ? ' disabled' : '') + '>이전</button>');
        for (let page = 1; page <= totalPages; page++) {
          if (page === 1 || page === totalPages || Math.abs(page - currentPage) <= 2) buttons.push('<button type="button" data-page="' + page + '" class="' + (page === currentPage ? 'active' : '') + '">' + page + '</button>');
          else if (buttons[buttons.length - 1] !== '<span>...</span>') buttons.push('<span>...</span>');
        }
        buttons.push('<button type="button" data-page="' + Math.min(totalPages, currentPage + 1) + '"' + (currentPage === totalPages ? ' disabled' : '') + '>다음</button>');
        pager.innerHTML = buttons.join("") + pageText;
      }
      pager.querySelectorAll("button[data-page]").forEach((button) => button.addEventListener("click", () => {
        currentPage = Number(button.dataset.page) || 1;
        render();
        container.closest(".category-block")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }));
    };
    render();
  }

  function ensureCategoryAllBlock(page) {
    const content = document.querySelector(".category-content") || document.querySelector("main");
    if (!content) return null;
    let section = document.getElementById("all-category-products");
    if (!section) {
      section = !content.classList.contains("category-content")
        ? content.querySelector(":scope > .category-block")
        : null;
    }
    if (!section) {
      section = document.createElement("section");
      content.insertBefore(section, content.firstChild);
    }
    section.id = "all-category-products";
    section.classList.add("category-block");
    let subhead = section.querySelector(":scope > .category-subhead");
    if (!subhead) {
      subhead = document.createElement("div");
      subhead.className = "category-subhead";
      subhead.innerHTML = '<h2>전체 상품</h2><span>선택한 카테고리의 상품을 표시합니다.</span>';
      section.insertBefore(subhead, section.firstChild);
    }
    let products = section.querySelector(":scope > .products");
    if (!products) {
      products = document.createElement("div");
      products.className = "products";
      section.appendChild(products);
    }
    const title = section.querySelector("h2");
    if (title) title.textContent = page === "liquid" ? "액상 전체 상품" : page === "disposable" ? "일회용전자담배 전체 상품" : page === "device" ? "기기 전체 상품" : page === "supply" ? "소모품 전체 상품" : "전체 상품";
    return products;
  }

  function ensureBlockProducts(block) {
    if (!block) return null;
    let container = block.querySelector(".products");
    if (!container) {
      const empty = block.querySelector(".desc");
      if (empty) empty.remove();
      container = document.createElement("div");
      container.className = "products";
      block.appendChild(container);
    }
    return container;
  }

  function renderCategoryPage(page, products) {
    const links = [...document.querySelectorAll(".category-menu a")];
    const requestedCategory = location.hash.replace("#", "");
    const selectedCategory = links.some((link) => link.getAttribute("href") === "#" + requestedCategory) ? requestedCategory : "";
    const pageProducts = products
      .filter((item) => matchesPage(item, page))
      .filter((item) => !selectedCategory || blockForCategory(item, page) === selectedCategory);
    const allContainer = ensureCategoryAllBlock(page);
    ensurePagerStyle();
    if (allContainer) renderPagedContainer(allContainer, pageProducts, "all");

    document.querySelectorAll(".category-content > .category-block:not(#all-category-products)").forEach((block) => {
      block.hidden = true;
    });
    const title = document.querySelector("#all-category-products h2");
    const activeLink = selectedCategory
      ? links.find((link) => link.getAttribute("href") === "#" + selectedCategory)
      : links.find((link) => link.dataset.category === "all");
    if (title && activeLink) {
      const label = activeLink.textContent.trim();
      title.textContent = selectedCategory ? label : label + " 전체";
    }
  }

  function renderSimpleList(page, products) {
    const container = document.querySelector(".timesale-products") || document.querySelector(".products") || document.querySelector("main .products") || document.querySelector("main");
    const filtered = products.filter((item) => matchesPage(item, page));
    ensurePagerStyle();
    renderPagedContainer(container, filtered, "all");
  }

  function renderMain(products) {
    const popular = document.getElementById("popularProducts");
    const newest = document.getElementById("newProducts");
    const timesale = document.getElementById("timesaleProducts");
    
    document.getElementById("adminRegisteredProductsSection")?.remove();

    const mainProducts = [...products].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    
    const inGroup = (item, group) => Array.isArray(item.raw && item.raw.mainDisplay) && item.raw.mainDisplay.includes(group);
    if (popular) {
      const popularProducts = mainProducts.filter((item) => inGroup(item, "popular"));
      appendBatch(popular, popularProducts.length ? popularProducts : mainProducts.slice(0, 20), 12);
    }
    if (newest) {
      const newProducts = mainProducts.filter((item) => inGroup(item, "new"));
      appendBatch(newest, newProducts.length ? newProducts : mainProducts, 24);
    }
    if (timesale) {
      const saleProducts = mainProducts.filter((item) => inGroup(item, "timesale") || matchesPage(item, "timesale"));
      const saleHtml = saleProducts.slice(0, 20).map(saleCard).join("");
      timesale.insertAdjacentHTML("afterbegin", saleHtml);
    }
  }


  function readRecentProducts() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); }
    catch (error) { return []; }
  }

  function writeRecentProduct(item) {
    if (!item || !item.code) return;
    const recent = readRecentProducts().filter((product) => product.code !== item.code);
    recent.unshift({ code: item.code, name: item.name || item.code, image: item.image || "", price: item.price || "", viewedAt: new Date().toISOString() });
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 12)));
    renderRecentQuickMenu();
  }

  function renderRecentQuickMenu() {
    const list = document.querySelector(".nav__recent_view ul");
    if (!list) return;
    const recent = readRecentProducts().slice(0, 3);
    if (!recent.length) return;
    list.innerHTML = recent.map((item) => '<li><a href="product-detail.html?product=' + encodeURIComponent(item.code) + '">' + (item.image ? '<img src="' + esc(item.image) + '" alt="' + esc(item.name) + '" onerror="this.style.display=\'none\'">' : '') + '<span>' + esc(item.name) + '</span></a></li>').join("");
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest('.admin-product[data-admin-product="true"]');
    if (!link) return;
    writeRecentProduct({ code: link.dataset.code, name: link.dataset.name, image: link.dataset.image, price: link.dataset.price });
  });

  async function run() {
    renderRecentQuickMenu();
    removeHiddenProductCards();
    const products = await collectProducts();
    console.log("띵베이프 상품 로드 완료:", products.length, "건");
    const page = location.pathname.split("/").pop().replace(".html", "") || "index";
    console.log("현재 페이지:", page);
    
    if (page === "index" || page === "diliquid-shop") renderMain(products);
    else if (["liquid", "disposable", "device", "supply"].includes(page)) renderCategoryPage(page, products);
    else if (["best", "new", "timesale"].includes(page)) renderSimpleList(page, products);
  }

  function refresh() {
    document.querySelectorAll(".admin-product[data-admin-product=\"true\"]").forEach((node) => node.remove());
    removeHiddenProductCards();
    run();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY || event.key === DELETED_KEY || event.key === UPDATED_KEY) refresh();
  });
  window.addEventListener("hashchange", refresh);
})();
