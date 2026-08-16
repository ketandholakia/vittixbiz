/**
 * Pure GSTIN format validation — no framework, no I/O. Mirrors the style of
 * tax-calculator.ts: plain functions, fully unit-testable.
 *
 * GSTIN anatomy (15 chars):
 *   [1-2] state code (01–38, the valid Indian state/UT range)
 *   [3-12] PAN: 5 letters, 4 digits, 1 letter
 *   [13] entity number (1–9 or A–Z)
 *   [14] literal 'Z'
 *   [15] checksum character (format-only check here)
 */

export interface GstinStructureResult {
  valid: boolean;
  error?: string;
}

export interface GstinValidationResult extends GstinStructureResult {
  checksumWarning?: string;
}

function charVal(c: string): number {
  return /[0-9]/.test(c) ? Number(c) : 10 + (c.charCodeAt(0) - 65); // A=10..Z=35
}

function valChar(v: number): string {
  return v < 10 ? String(v) : String.fromCharCode(65 + (v - 10));
}

/**
 * Luhn mod-36 checksum over the first 14 characters of a GSTIN, returning the
 * 15th (checksum) character.
 *
 * CALIBRATION WARNING — do not "fix" or "improve" this algorithm without
 * re-verifying it first. It was verified against exactly ONE confirmed-correct
 * example (27AABCU9603R1Z -> checksum N) and NOT cross-checked against the
 * official NIC/GSTN specification or multiple independent examples. Two other
 * commonly-cited GSTINs found online did NOT match, most likely because they
 * are illustrative placeholders rather than real checksum-valid numbers, but
 * that could not be fully ruled out. Consequently the caller treats a checksum
 * mismatch as a soft warning (checksumWarning), never a hard rejection.
 */
export function computeChecksum(gstin14: string): string {
  let total = 0;
  let double = false; // leftmost character is NOT doubled
  for (const c of gstin14) {
    let v = charVal(c);
    if (double) {
      v = v * 2;
      v = Math.floor(v / 36) + (v % 36);
    }
    total += v;
    double = !double;
  }
  const checksum = (36 - (total % 36)) % 36;
  return valChar(checksum);
}

export function validateStructure(gstin: string): GstinStructureResult {
  if (gstin.length !== 15) {
    return { valid: false, error: 'GSTIN must be exactly 15 characters.' };
  }

  const stateCode = gstin.slice(0, 2);
  if (!/^\d{2}$/.test(stateCode)) {
    return {
      valid: false,
      error: 'First two characters must be the state code (digits).',
    };
  }
  const stateCodeNumber = Number(stateCode);
  if (stateCodeNumber < 1 || stateCodeNumber > 38) {
    return {
      valid: false,
      error: 'State code must be between 01 and 38 (valid Indian state/UT codes).',
    };
  }

  const panPart = gstin.slice(2, 12);
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panPart)) {
    return {
      valid: false,
      error: 'Characters 3–12 must match PAN format (5 letters, 4 digits, 1 letter).',
    };
  }

  const entityNumber = gstin[12];
  if (!/^[1-9A-Z]$/.test(entityNumber)) {
    return {
      valid: false,
      error: 'Character 13 (entity number) must be 1–9 or A–Z.',
    };
  }

  if (gstin[13] !== 'Z') {
    return { valid: false, error: 'Character 14 must be the letter Z.' };
  }

  if (!/^[0-9A-Z]$/.test(gstin[14])) {
    return {
      valid: false,
      error: 'Character 15 (checksum) must be alphanumeric.',
    };
  }

  return { valid: true };
}

/**
 * Structural validation plus a SOFT checksum check.
 *
 * valid:false is returned ONLY for a structural mismatch. If the structure is
 * valid but the checksum digit does not match computeChecksum(), the GSTIN is
 * still accepted and a checksumWarning is returned instead — see the
 * CALIBRATION WARNING on computeChecksum for why this must stay a warning.
 */
export function validate(gstin: string): GstinValidationResult {
  const structural = validateStructure(gstin);
  if (!structural.valid) {
    return { valid: false, error: structural.error };
  }

  if (computeChecksum(gstin.slice(0, 14)) !== gstin[14]) {
    return {
      valid: true,
      checksumWarning:
        "GSTIN structure is valid but the checksum digit doesn't match our calculation — this may still be a real GSTIN; verify against the GST portal if in doubt",
    };
  }

  return { valid: true };
}

export const GstinValidator = {
  validateStructure,
  computeChecksum,
  validate,
};
