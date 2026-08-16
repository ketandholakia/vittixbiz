import { Money } from '@vittixbiz/shared-types';
import Decimal from 'decimal.js';

export interface GstSplitInput {
  taxableAmount: Money;
  hsnSacCode: string;
  supplierStateCode: string;
  placeOfSupplyStateCode: string;
  ratePercent: Decimal;
  /** Cess is a flat add-on on the taxable amount, applied regardless of place of supply. */
  cessPercent?: Decimal;
}

export interface GstSplitResult {
  cgst: Money;
  sgst: Money;
  igst: Money;
  cess: Money;
}

export function calculateGstSplit(input: GstSplitInput): GstSplitResult {
  const {
    taxableAmount,
    supplierStateCode,
    placeOfSupplyStateCode,
    ratePercent,
    cessPercent,
  } = input;

  // We need to work with the underlying Decimal to do precise percent calculations without premature rounding
  // For GST, ratePercent is passed as a percentage (e.g. 18.0)

  const taxableDecimal = new Decimal(taxableAmount.toString());
  const rateAsDecimal = ratePercent.dividedBy(100);
  const totalTaxAmount = taxableDecimal.times(rateAsDecimal);

  const zero = new Money('0.00');

  // Cess is a flat add-on on the same taxable amount as the main GST rate,
  // rounded once at the end (ROUND_HALF_UP, 2dp) just like cgst/sgst/igst.
  // It does NOT split by intra/inter-state — it applies in full regardless.
  const cess = cessPercent && !cessPercent.isZero()
    ? new Money(taxableDecimal.times(cessPercent.dividedBy(100)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP))
    : zero;

  if (ratePercent.isZero()) {
    return { cgst: zero, sgst: zero, igst: zero, cess };
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
      cess,
    };
  } else {
    // Inter-state: Full IGST
    const fullTax = totalTaxAmount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    return {
      cgst: zero,
      sgst: zero,
      igst: new Money(fullTax),
      cess,
    };
  }
}
