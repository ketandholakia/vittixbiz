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
    // Round total tax to 2 decimal places first to get the exact total liability
    const roundedTotal = totalTaxAmount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    
    // Then derive CGST by halving the exact total (rounding that half up to 2 places)
    const cgstDecimal = roundedTotal.dividedBy(2).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    
    // Derive SGST as remainder to ensure CGST + SGST perfectly reconciles to roundedTotal
    const sgstDecimal = roundedTotal.minus(cgstDecimal);

    return {
      cgst: new Money(cgstDecimal),
      sgst: new Money(sgstDecimal),
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
