import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeProduct, loadProducts } from "../src/data.js";
import { getFamilyId, matchesSearch, cardTitle } from "../src/productFamilies.js";

test("the imported catalog keeps vehicle make separate from product type", async () => {
  const { products } = JSON.parse(await readFile(new URL("../../../data/catalog.json", import.meta.url)));
  const items = products.map(normalizeProduct);
  const counts = Object.fromEntries([...new Set(items.map(p => p.familyId))].map(id => [id, items.filter(p => p.familyId === id).length]));
  assert.deepEqual(counts, { radiadores: 72, intercoolers: 65, enfriadores: 33, condensadores: 6, refrigerantes: 2, componentes: 8 });
  assert.ok(items.some(p => p.familyId === "radiadores" && /volvo/i.test(p.brand)));
  assert.equal(getFamilyId({ name: "Kit de enfriador de aceite", category: { name: "Volvo" } }), "enfriadores");
});

test("new products support explicit types, legacy categories and accent-insensitive lookup", () => {
  assert.equal(getFamilyId({ name: "Referencia 52", metadata: { catalogFamily: "llantas" } }), "llantas");
  assert.equal(getFamilyId({ name: "15W-40", category: { name: "Aceites" } }), "aceites");
  assert.equal(getFamilyId({ name: "Neumático para camión" }), "llantas");
  assert.equal(getFamilyId({ name: "Sin clasificar", metadata: { catalogFamily: "invalid" } }), "otros");
  const product = normalizeProduct({ name: "Radiador camión Volvo / 980 × 500", sku: "X100", brand: "Volvo" });
  assert.ok(matchesSearch(product, "CAMION x100 radiadores"));
  assert.equal(matchesSearch(product, "volvo llantas"), false);
  assert.equal(cardTitle(product), "Radiador camión Volvo");
});

test("an empty live catalog stays empty", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ data: [], meta: { total: 0 } }));
  assert.deepEqual(await loadProducts(), []);
  assert.equal(fetch.mock.callCount(), 1);
});
