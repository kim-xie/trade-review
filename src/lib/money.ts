import type { Fees } from "./types";

export const ZERO_FEES: Fees = { commission: 0, stampTax: 0, transferFee: 0, otherFee: 0 };

export function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round((n + Number.EPSILON) * f) / f;
}

export function totalFees(f: Fees): number {
  return f.commission + f.stampTax + f.transferFee + f.otherFee;
}

export function scaleFees(f: Fees, ratio: number): Fees {
  return {
    commission: f.commission * ratio,
    stampTax: f.stampTax * ratio,
    transferFee: f.transferFee * ratio,
    otherFee: f.otherFee * ratio,
  };
}

export function addFees(a: Fees, b: Fees): Fees {
  return {
    commission: a.commission + b.commission,
    stampTax: a.stampTax + b.stampTax,
    transferFee: a.transferFee + b.transferFee,
    otherFee: a.otherFee + b.otherFee,
  };
}

export function subFees(a: Fees, b: Fees): Fees {
  return {
    commission: a.commission - b.commission,
    stampTax: a.stampTax - b.stampTax,
    transferFee: a.transferFee - b.transferFee,
    otherFee: a.otherFee - b.otherFee,
  };
}

export function roundFees(f: Fees): Fees {
  return {
    commission: round(f.commission),
    stampTax: round(f.stampTax),
    transferFee: round(f.transferFee),
    otherFee: round(f.otherFee),
  };
}
