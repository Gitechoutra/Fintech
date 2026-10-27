/** Bajaj Finance product catalogue for the Home grids, and which product a linked
 *  loan belongs to (from its product name). Presentation only — the loans themselves
 *  come from the API. Pure functions (unit-tested). */

// `match` is tested in `order` (most specific first) so e.g. "Home Appliances EMI"
// is not mistaken for a home loan; display order is the array order. EMI emojis never
// repeat a loan emoji, so "Two-Wheeler Loan" and "Two-Wheeler Loan EMI" look different.
export const LOAN_TYPES = [
  { key: "personal", name: "Personal Loan", emoji: "💰", order: 10, match: /personal/i },
  { key: "home", name: "Home Loan", emoji: "🏠", order: 7, match: /home|housing|mortgage/i },
  { key: "business", name: "Business Loan", emoji: "💼", order: 8, match: /business|msme|\bsme\b/i },
  { key: "gold", name: "Gold Loan", emoji: "🪙", order: 5, match: /gold/i },
  { key: "durable", name: "Consumer Durable Loan", emoji: "📺", order: 6,
    match: /consumer durable|mobile|phone|laptop|computer|electronic|appliance|furniture|\btv\b|emi card/i },
  { key: "two_wheeler", name: "Two-Wheeler Loan", emoji: "🏍️", order: 3, match: /two[- ]?wheeler|bike|scooter|motorcycle/i },
  { key: "car", name: "Car Loan", emoji: "🚗", order: 4, match: /\bcar\b|four[- ]?wheeler|auto loan/i },
  { key: "lap", name: "Loan Against Property", emoji: "🏢", order: 1, match: /against property|\blap\b/i },
  { key: "education", name: "Education Loan", emoji: "🎓", order: 9, match: /education|student/i },
  { key: "las", name: "Loan Against Securities", emoji: "📈", order: 2, match: /against securities|\blas\b|shares|mutual fund/i },
];

export const EMI_TYPES = [
  { key: "mobile", name: "Mobile Phone EMI", emoji: "📱", order: 3, match: /mobile|smartphone|phone/i },
  { key: "electronics", name: "Consumer Electronics EMI", emoji: "🎧", order: 7, match: /electronic|consumer durable|\btv\b|television|camera/i },
  { key: "appliances", name: "Home Appliances EMI", emoji: "🧺", order: 6, match: /appliance|washing|refrigerator|fridge|air condition/i },
  { key: "laptop", name: "Laptop & Computer EMI", emoji: "💻", order: 4, match: /laptop|computer|\bpc\b/i },
  { key: "personal", name: "Personal Loan EMI", emoji: "💸", order: 10, match: /personal/i },
  { key: "two_wheeler", name: "Two-Wheeler Loan EMI", emoji: "🛵", order: 1, match: /two[- ]?wheeler|bike|scooter|motorcycle/i },
  { key: "furniture", name: "Furniture EMI", emoji: "🛋️", order: 5, match: /furniture|sofa|mattress/i },
  { key: "home", name: "Home Loan EMI", emoji: "🔑", order: 8, match: /home|housing|mortgage/i },
  { key: "car", name: "Car Loan EMI", emoji: "🚙", order: 2, match: /\bcar\b|four[- ]?wheeler|auto loan/i },
  { key: "education", name: "Education Loan EMI", emoji: "📚", order: 9, match: /education|student/i },
];

export const OTHER_LOAN = { key: "other", name: "Other loans", emoji: "🏦" };
export const OTHER_EMI = { key: "other", name: "Other EMIs", emoji: "🗓️" };

/** Key of the product a loan belongs to, or "other" when its name matches none. */
export function productKey(loan, types) {
  const name = loan.product_name || "";
  const hit = [...types].sort((a, b) => a.order - b.order).find((t) => t.match.test(name));
  return hit ? hit.key : "other";
}

/** Every catalogue product with the user's loans of that kind; an "other" group is
 *  appended only when some loan matched nothing. Products the user has come first. */
export function groupByProduct(loans, types, other) {
  const groups = types.map((t) => ({ ...t, loans: [] }));
  const rest = { ...other, loans: [] };
  for (const l of loans) {
    const k = productKey(l, types);
    (groups.find((g) => g.key === k) || rest).loans.push(l);
  }
  if (rest.loans.length) groups.push(rest);
  return [...groups.filter((g) => g.loans.length), ...groups.filter((g) => !g.loans.length)];
}
