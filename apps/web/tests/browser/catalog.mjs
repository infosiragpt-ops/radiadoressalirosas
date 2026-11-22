import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";

const origin = process.env.CATALOG_URL || "http://127.0.0.1:8080";
const screenshots = process.env.SCREENSHOTS_DIR || "output/browser";
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || "google-chrome" });

try {
  await mkdir(screenshots, { recursive: true });
  const phone = { width: 390, height: 844 };
  const page = await browser.newPage({ viewport: phone, isMobile: true, hasTouch: true, locale: "es-PE" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  const count = page.locator(".result-count");
  const button = (name) => page.getByRole("button", { name, exact: true });
  const tabs = page.getByRole("navigation", { name: "Accesos de la aplicación" });
  await count.waitFor();
  assert.equal(await count.innerText(), "186 productos");
  assert.equal(await page.locator(".shop-grid article").count(), 24);
  assert.equal(await page.locator(".family-choice").count(), 3);
  await page.waitForFunction(() => document.fonts.status === "loaded" &&
    [...document.querySelectorAll(".family-photo img, .shop-grid article:first-child img")].every(img => img.complete && img.naturalWidth));
  await page.screenshot({ path: join(screenshots, "movil.png") });

  for (const [width, columns] of [[320, 2], [360, 2], [390, 2], [430, 2], [768, 3], [1366, 4]]) {
    await page.setViewportSize({ width, height: phone.height });
    const layout = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      columns: getComputedStyle(document.querySelector(".shop-grid")).gridTemplateColumns.split(" ").length,
    }));
    assert.equal(layout.scrollWidth, width, "Desbordamiento a " + width + " px");
    assert.equal(layout.columns, columns);
    const fit = await page.locator(".family-choice").evaluateAll(cards => cards.every(card => {
      const image = card.querySelector("img").getBoundingClientRect();
      const frame = card.querySelector(".family-photo").getBoundingClientRect();
      return image.top >= frame.top - 1 && image.bottom <= frame.bottom + 1;
    }));
    assert.ok(fit, "Imágenes de categoría dentro de su espacio a " + width + " px");
  }
  await page.screenshot({ path: join(screenshots, "portada.png") });
  await page.setViewportSize(phone);

  await button("Radiadores").click();
  assert.equal(await count.innerText(), "72 productos");
  await page.getByLabel("Filtrar por marca").selectOption("Volvo");
  const volvo = await count.innerText();
  assert.match(volvo, /^[1-9]/);
  assert.ok((await page.locator(".shop-grid .product-category").allTextContents()).every(make => make === "Volvo"));
  await page.getByLabel("Ordenar productos").selectOption("inverso");
  await page.reload({ waitUntil: "domcontentloaded" });
  await count.waitFor();
  assert.equal(await count.innerText(), volvo);
  assert.equal(await page.getByLabel("Ordenar productos").inputValue(), "inverso");
  const code = (await page.locator(".product-code").first().innerText()).replace(/^Código /, "");
  await button("Limpiar filtros").click();
  await page.locator("#catalog-query").fill(code);
  await page.locator(".shop-grid article h3 a").first().click();
  assert.ok((await page.locator(".product-meta").innerText()).includes(code));
  const quote = new URL(await page.locator(".purchase-row a").getAttribute("href"));
  assert.equal(quote.origin + quote.pathname, "https://wa.me/51919475144");
  assert.ok(quote.searchParams.get("text").includes(code));

  await tabs.getByText("Catálogo").click();
  for (const family of ["Llantas", "Aceites"]) {
    await button(family).click();
    assert.equal(await count.innerText(), "0 productos");
    const href = await page.locator(".catalog-inquiry").getAttribute("href");
    assert.ok(decodeURIComponent(href).includes(family.toLowerCase()));
    await button("Ver todos los productos").click();
  }
  await button("Ver todas").click();
  await button("Enfriadores").click();
  assert.equal(await count.innerText(), "33 productos");
  await button("Limpiar filtros").click();
  await button("Siguiente").click();
  assert.match(await page.locator(".catalog-pages").innerText(), /Página 2 de 8/);
  await button("Anterior").click();

  await tabs.getByText("Carrito").click();
  assert.equal(new URL(page.url()).pathname, "/cart/");
  await tabs.getByText("Contacto").click();
  await page.locator('.contact-info a[href^="https://wa.me/51919475144"]').waitFor();
  await tabs.getByText("Mi cuenta").click();
  await page.locator('main input[type="password"]').first().waitFor();
  await button("Abrir menú").click();
  await page.locator("#mobile-menu.is-open").waitFor();
  await button("Cerrar menú").click();
  await page.goto(origin + "/categoria-producto/volvo/", { waitUntil: "domcontentloaded" });
  await count.waitFor();
  assert.match(await count.innerText(), /^[1-9]/);
  assert.ok((await page.locator(".shop-grid .product-category").allTextContents()).every(make => make === "Volvo"));
  assert.deepEqual(errors, []);
  console.log("Catálogo, categorías, orden, marcas, búsqueda por código, cotización y navegación verificados en seis anchos.");
} finally {
  await browser.close();
}
