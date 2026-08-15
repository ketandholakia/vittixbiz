import { Money } from '@vittixbiz/shared-types';
import Decimal from 'decimal.js';

export interface GstSplitInput {
  taxableAmount: Money;
  hsnSacCode: string;
  supplierStateCode: string;
  placeOfSupplyStateCode: string;
  ratePercent: Decimal;
}

export interface GstSplitResult {
  cgst: Money;
  sgst: Money;
  igst: Money;
  cess: Money; // For future usage, leaving as 0 for now
}

export function calculateGstSplit(input: GstSplitInput): GstSplitResult {
  const { taxableAmount, supplierStateCode, placeOfSupplyStateCode, ratePercent } = input;

  // We need to work with the underlying Decimal to do precise percent calculations without premature rounding
  // Assuming Money constructor takes a Decimal or string
  // For GST, ratePercent is passed as a percentage (e.g. 18.0)
  
  const rateAsDecimal = ratePercent.dividedBy(100);
  const totalTaxAmount = new Decimal(taxableAmount.toString()).times(rateAsDecimal);

  const zero = new Money('0.00');

  if (ratePercent.isZero()) {
    return { cgst: zero, sgst: zero, igst: zero, cess: zero };
  }

  // Intra-state vs Inter-state
  if (supplierStateCode === placeOfSupplyStateCode) {
    // Intra-state: Split 50/50
    // We round at the final step: HALF_UP
    const halfTax = totalTaxAmount.dividedBy(2).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const halfMoney = new Money(halfTax);

    return {
      cgst: halfMoney,
      sgst: halfMoney,
      igst: zero,
      cess: zero,
    };
  } else {
    // Inter-state: Full IGST
    const fullTax = totalTaxAmount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    
    return {
      cgst: zero,
      sgst: zero,
      igst: new Money(fullTax),
      cess: zero,
    };
  }
}
