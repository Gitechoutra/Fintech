import { describe, expect, it } from "vitest";
import {
  validateEmail, validateIdentifier, validateMobile, validateMpin, validatePaymentAmount,
} from "./validation";

describe("validation mirrors the server rules", () => {
  it("mobile", () => {
    expect(validateMobile("9876543210")).toBe("");
    expect(validateMobile("+91 98765 43210")).toBe("");
    expect(validateMobile("5876543210")).not.toBe("");
  });

  it("mpin: exactly 4 digits, not trivial", () => {
    expect(validateMpin("4826")).toBe("");
    expect(validateMpin("1111")).not.toBe("");
    expect(validateMpin("1234")).not.toBe("");
    expect(validateMpin("48261")).not.toBe("");
  });

  it("email", () => {
    expect(validateEmail("a@b.co")).toBe("");
    expect(validateEmail("nope")).not.toBe("");
  });

  it("loan identifier uses the provider's pattern", () => {
    expect(validateIdentifier("ln 1234-5678", "LN\\d{8}", "Loan account number")).toBe("");
    expect(validateIdentifier("LN1", "LN\\d{8}", "Loan account number")).not.toBe("");
  });

  it("card identifier: last 4 digits only", () => {
    expect(validateIdentifier("4321", "\\d{4}", "Last 4 digits of your card")).toBe("");
    expect(validateIdentifier("4111111111111111", "\\d{4}", "Last 4 digits of your card")).not.toBe("");
  });

  it("payment amount", () => {
    expect(validatePaymentAmount("100", "500")).toBe("");
    expect(validatePaymentAmount("600", "500")).not.toBe("");
    expect(validatePaymentAmount("1.234", null)).not.toBe("");
    expect(validatePaymentAmount("0.5", null)).not.toBe("");
  });
});
