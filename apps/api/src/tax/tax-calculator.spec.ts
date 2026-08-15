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
});
