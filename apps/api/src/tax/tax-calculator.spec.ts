import { calculateGstSplit } from './tax-calculator';
import { Money } from '@vittixbiz/shared-types';
import Decimal from 'decimal.js';

describe('TaxCalculator', () => {
  it('should split tax 50/50 for intra-state supply', () => {
    const result = calculateGstSplit({
      taxableAmount: new Money('100.00'),
      hsnSacCode: '9983',
      supplierStateCode: '27',
      placeOfSupplyStateCode: '27',
      ratePercent: new Decimal('18.0'),
    });

    expect(result.cgst.toString()).toBe('9.00');
    expect(result.sgst.toString()).toBe('9.00');
    expect(result.igst.toString()).toBe('0.00');
  });

  it('should apply full tax to IGST for inter-state supply', () => {
    const result = calculateGstSplit({
      taxableAmount: new Money('100.00'),
      hsnSacCode: '9983',
      supplierStateCode: '27',
      placeOfSupplyStateCode: '29',
      ratePercent: new Decimal('18.0'),
    });

    expect(result.cgst.toString()).toBe('0.00');
    expect(result.sgst.toString()).toBe('0.00');
    expect(result.igst.toString()).toBe('18.00');
  });

  it('should handle zero-rated tax correctly', () => {
    const result = calculateGstSplit({
      taxableAmount: new Money('100.00'),
      hsnSacCode: '9983',
      supplierStateCode: '27',
      placeOfSupplyStateCode: '27',
      ratePercent: new Decimal('0'),
    });

    expect(result.cgst.toString()).toBe('0.00');
    expect(result.sgst.toString()).toBe('0.00');
    expect(result.igst.toString()).toBe('0.00');
  });

  it('should round half-up at the final level correctly for odd paisa amounts (intra-state)', () => {
    // 13.55 * 18% = 2.439
    // Split 50/50 -> 1.2195 each
    // Round half up to 2 decimal places -> 1.22 each
    const result = calculateGstSplit({
      taxableAmount: new Money('13.55'),
      hsnSacCode: '9983',
      supplierStateCode: '27',
      placeOfSupplyStateCode: '27',
      ratePercent: new Decimal('18.0'),
    });

    expect(result.cgst.toString()).toBe('1.22');
    expect(result.sgst.toString()).toBe('1.22');
    expect(result.igst.toString()).toBe('0.00');
  });
  
  it('should round half-up at the final level correctly for odd paisa amounts (inter-state)', () => {
    // 13.55 * 18% = 2.439 -> rounds to 2.44
    const result = calculateGstSplit({
      taxableAmount: new Money('13.55'),
      hsnSacCode: '9983',
      supplierStateCode: '27',
      placeOfSupplyStateCode: '29',
      ratePercent: new Decimal('18.0'),
    });

    expect(result.cgst.toString()).toBe('0.00');
    expect(result.sgst.toString()).toBe('0.00');
    expect(result.igst.toString()).toBe('2.44');
  });

  it('should ensure cgst and sgst perfectly reconcile to the rounded total liability', () => {
    // 0.27777... * 18% = 0.05
    // Halved it is 0.025 each. If rounded independently, both become 0.03 (sum = 0.06 instead of 0.05).
    // Our fix ensures one is 0.03 and the other is 0.02, summing to 0.05.
    const taxableAmount = new Money('0.28'); // 0.28 * 18% = 0.0504 -> 0.05
    const ratePercent = new Decimal('18.0');
    
    const result = calculateGstSplit({
      taxableAmount,
      hsnSacCode: '9983',
      supplierStateCode: '27',
      placeOfSupplyStateCode: '27',
      ratePercent,
    });
    
    const exactTotalTax = new Decimal(taxableAmount.toString()).times(ratePercent.dividedBy(100));
    const expectedRoundedTotal = exactTotalTax.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    
    const cgstDecimal = new Decimal(result.cgst.toString());
    const sgstDecimal = new Decimal(result.sgst.toString());
    
    expect(cgstDecimal.plus(sgstDecimal).toString()).toBe(expectedRoundedTotal.toString());
    expect(expectedRoundedTotal.toString()).toBe('0.05');
  });

  it('should apply cess as a flat add-on for intra-state supplies', () => {
    const result = calculateGstSplit({
      taxableAmount: new Money('100.00'),
      hsnSacCode: '9983',
      supplierStateCode: '27',
      placeOfSupplyStateCode: '27',
      ratePercent: new Decimal('18.0'),
      cessPercent: new Decimal('10.0'),
    });

    expect(result.cgst.toString()).toBe('9.00');
    expect(result.sgst.toString()).toBe('9.00');
    expect(result.igst.toString()).toBe('0.00');
    expect(result.cess.toString()).toBe('10.00');
  });

  it('should apply cess as a flat add-on for inter-state supplies', () => {
    const result = calculateGstSplit({
      taxableAmount: new Money('100.00'),
      hsnSacCode: '9983',
      supplierStateCode: '27',
      placeOfSupplyStateCode: '29',
      ratePercent: new Decimal('18.0'),
      cessPercent: new Decimal('10.0'),
    });

    expect(result.cgst.toString()).toBe('0.00');
    expect(result.sgst.toString()).toBe('0.00');
    expect(result.igst.toString()).toBe('18.00');
    expect(result.cess.toString()).toBe('10.00');
  });

  it('should round cess half-up to 2 decimal places', () => {
    // 13.55 * 10% = 1.355 -> rounds to 1.36
    const result = calculateGstSplit({
      taxableAmount: new Money('13.55'),
      hsnSacCode: '9983',
      supplierStateCode: '27',
      placeOfSupplyStateCode: '27',
      ratePercent: new Decimal('18.0'),
      cessPercent: new Decimal('10.0'),
    });

    expect(result.cess.toString()).toBe('1.36');
  });

  it('should return zero cess when no cessPercent is provided', () => {
    const result = calculateGstSplit({
      taxableAmount: new Money('100.00'),
      hsnSacCode: '9983',
      supplierStateCode: '27',
      placeOfSupplyStateCode: '27',
      ratePercent: new Decimal('18.0'),
    });

    expect(result.cess.toString()).toBe('0.00');
  });

  it('should still apply cess on a zero-rated supply', () => {
    // GST is 0% but cess still applies (e.g. certain exempt-with-cess goods)
    const result = calculateGstSplit({
      taxableAmount: new Money('100.00'),
      hsnSacCode: '9983',
      supplierStateCode: '27',
      placeOfSupplyStateCode: '27',
      ratePercent: new Decimal('0'),
      cessPercent: new Decimal('10.0'),
    });

    expect(result.cgst.toString()).toBe('0.00');
    expect(result.sgst.toString()).toBe('0.00');
    expect(result.igst.toString()).toBe('0.00');
    expect(result.cess.toString()).toBe('10.00');
  });
});
