window.TTHING_IMPORTED_PRODUCTS = [];
try {
  localStorage.removeItem("tthingAdminProducts");
  localStorage.removeItem("tthingCustomerProducts");
  localStorage.removeItem("tthingDeletedProductCodes");
  localStorage.setItem("tthingAdminProductsUpdatedAt", String(Date.now()));
} catch (error) {}
