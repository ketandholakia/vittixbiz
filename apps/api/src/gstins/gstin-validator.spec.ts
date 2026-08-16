import { computeChecksum, validate, validateStructure } from './gstin-validator';

/**
 * GstinValidator tests.
 *
 * The checksum algorithm is empirically calibrated against exactly ONE
 * confirmed-correct example (27AABCU9603R1Z -> N) — see the CALIBRATION
 * WARNING in gstin-validator.ts. These tests deliberately pin that behavior,
 * including the soft-warning (not hard-reject) contract for checksum
 * mismatches.
 */

describe('GstinValidator.computeChecksum', () => {
  it('matches the verified example 27AABCU9603R1Z -> N', () => {
    expect(computeChecksum('27AABCU9603R1Z')).toBe('N');
  });
});

describe('GstinValidator.validateStructure', () => {
  it('accepts the verified valid example', () => {
    expect(validateStructure('27AABCU9603R1ZN')).toEqual({ valid: true });
  });

  it('rejects a wrong length', () => {
    expect(validateStructure('27AABCU9603R1Z').valid).toBe(false);
    expect(validateStructure('27AABCU9603R1ZNN').valid).toBe(false);
  });

  it('rejects an out-of-range state code', () => {
    expect(validateStructure('00AABCU9603R1ZN').valid).toBe(false);
    expect(validateStructure('39AABCU9603R1ZN').valid).toBe(false);
  });

  it('rejects a malformed PAN portion', () => {
    // 11 chars in the PAN field (should be 5 letters + 4 digits + 1 letter)
    expect(validateStructure('27AABCDEF960R1ZN').valid).toBe(false);
  });

  it('rejects a wrong character 14 (not Z)', () => {
    const result = validateStructure('27AABCU9603R1AN');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Character 14');
  });

  it('rejects a non-alphanumeric checksum character', () => {
    expect(validateStructure('27AABCU9603R1Z-').valid).toBe(false);
  });
});

describe('GstinValidator.validate', () => {
  it('accepts the verified valid example with no warning', () => {
    expect(validate('27AABCU9603R1ZN')).toEqual({ valid: true });
  });

  it('rejects a structural mismatch with valid:false', () => {
    const result = validate('27AABCU9603R1Z');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns valid:true with a checksumWarning (never valid:false) for a wrong checksum digit', () => {
    const result = validate('27AABCU9603R1ZM'); // 'M' is deliberately wrong (correct is 'N')
    expect(result.valid).toBe(true);
    expect(result.checksumWarning).toBeDefined();
    expect(result.checksumWarning).toContain('checksum');
    expect(result.error).toBeUndefined();
  });
});
