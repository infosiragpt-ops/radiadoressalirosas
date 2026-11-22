export const productFamilies = [
  { id: "radiadores", label: "Radiadores", image: "/assets/original/products/5719-1-freightliner.jpg", pattern: /^radiador(?:es)?\b/ },
  { id: "llantas", label: "Llantas", image: "/categorias/llantas.webp", pattern: /^(?:llantas?|neumaticos?|cubiertas?)\b/ },
  { id: "aceites", label: "Aceites", image: "/categorias/aceites.webp", pattern: /^(?:aceites?|lubricantes?)\b/ },
  { id: "intercoolers", label: "Intercoolers", pattern: /^intercoolers?\b/ },
  { id: "enfriadores", label: "Enfriadores", pattern: /^(?:kit (?:de )?)?enfriador(?:es)?\b/ },
  { id: "condensadores", label: "Condensadores", pattern: /^condensador(?:es)?\b/ },
  { id: "refrigerantes", label: "Refrigerantes", pattern: /^(?:refrigerantes?|anticongelantes?)\b/ },
  { id: "componentes", label: "Componentes", pattern: /^(?:componentes?|carcasas?|tapas?|tanques?|panal(?:es)?)\b/ },
  { id: "otros", label: "Otros repuestos" },
];

export const familyById = new Map(productFamilies.map((family) => [family.id, family]));
export const plainText = (value = "") => String(value).normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

export function getFamilyId(product) {
  const assigned = product.metadata?.catalogFamily;
  if (familyById.has(assigned)) return assigned;
  const category = plainText(product.category?.name || product.category);
  const name = plainText(product.name);
  // Earlier catalogs stored the vehicle make as the category.
  return productFamilies.find((family) => family.pattern?.test(category))?.id
    || productFamilies.find((family) => family.pattern?.test(name))?.id
    || "otros";
}

export function matchesSearch(product, query) {
  const words = plainText(query).split(/\s+/).filter(Boolean);
  const text = plainText([product.name, product.brand, product.sku, product.category,
    familyById.get(product.familyId)?.label].join(" "));
  return words.every((word) => text.includes(word));
}

export function cardTitle(product) {
  // Keep sizes and the full OEM reference on the detail page.
  const trimmed = product.name.replace(/\s+\/\s+\d.*$/, "").trim();
  const sku = String(product.sku || "").trim();
  const title = sku && trimmed.endsWith(sku) ? trimmed.slice(0, -sku.length) : trimmed;
  return title.replace(/(?:\s+[–—-])+\s*$/, "").trim() || product.name;
}
