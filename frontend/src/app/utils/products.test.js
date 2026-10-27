import { describe, expect, it } from "vitest";
import { EMI_TYPES, LOAN_TYPES, OTHER_EMI, OTHER_LOAN, groupByProduct, productKey } from "./products";

const loan = (product_name) => ({ loan_id: product_name, product_name });

describe("product matching", () => {
  it("maps loans to Bajaj loan products", () => {
    expect(productKey(loan("Two-Wheeler Loan"), LOAN_TYPES)).toBe("two_wheeler");
    expect(productKey(loan("Home Loan"), LOAN_TYPES)).toBe("home");
    expect(productKey(loan("Mobile Phone EMI"), LOAN_TYPES)).toBe("durable");
    expect(productKey(loan("Loan Against Property"), LOAN_TYPES)).toBe("lap");
    expect(productKey(loan("Bajaj Finance Loan"), LOAN_TYPES)).toBe("other");
    expect(productKey({ product_name: null }, LOAN_TYPES)).toBe("other");
  });

  it("maps loans to EMI products without confusing home loans and appliances", () => {
    expect(productKey(loan("Home Appliances EMI"), EMI_TYPES)).toBe("appliances");
    expect(productKey(loan("Home Loan"), EMI_TYPES)).toBe("home");
    expect(productKey(loan("Consumer Durable Loan"), EMI_TYPES)).toBe("electronics");
    expect(productKey(loan("Personal Loan"), EMI_TYPES)).toBe("personal");
  });

  it("groups owned products first and adds Other only when needed", () => {
    const g = groupByProduct([loan("Gold Loan"), loan("Gold Loan"), loan("Bajaj Finance Loan")], LOAN_TYPES, OTHER_LOAN);
    expect(g[0].key).toBe("gold");
    expect(g[0].loans).toHaveLength(2);
    expect(g[1].key).toBe("other");
    expect(g).toHaveLength(LOAN_TYPES.length + 1);
    expect(groupByProduct([], LOAN_TYPES, OTHER_LOAN).some((x) => x.key === "other")).toBe(false);
  });
});

describe("product emojis", () => {
  it("are unique across loans and EMIs", () => {
    const all = [...LOAN_TYPES, OTHER_LOAN, ...EMI_TYPES, OTHER_EMI].map((t) => t.emoji);
    expect(new Set(all).size).toBe(all.length);
  });
});
