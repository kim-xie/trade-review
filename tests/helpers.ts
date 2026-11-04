import type { Fees, Fill, Side } from "../src/lib/types";

let n = 0;
export function fill(p: {
  date: string;
  side: Side;
  quantity: number;
  price: number;
  code?: string;
  time?: string;
  fees?: Partial<Fees>;
  id?: string;
}): Fill {
  n += 1;
  return {
    id: p.id ?? `f${n}`,
    date: p.date,
    time: p.time,
    code: p.code ?? "600000",
    side: p.side,
    quantity: p.quantity,
    price: p.price,
    amount: p.price * p.quantity,
    fees: { commission: 0, stampTax: 0, transferFee: 0, otherFee: 0, ...p.fees },
    seq: n,
  };
}
