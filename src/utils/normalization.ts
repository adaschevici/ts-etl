// src/utils/normalization.ts

export type ParsedValue = string;

export const H_NAME = 'Name';
export const H_ADDRESS = 'Address';
export const H_POSTCODE = 'Postcode';
export const H_PHONE = 'Phone';
export const H_CREDIT_LIMIT = 'Credit Limit';
export const H_BIRTHDAY = 'Birthday';

export const EXPECTED_HEADERS: readonly string[] = [
  H_NAME,
  H_ADDRESS,
  H_POSTCODE,
  H_PHONE,
  H_CREDIT_LIMIT,
  H_BIRTHDAY,
];

export function normalizeFieldValue(
  header: string,
  value: string | null | undefined,
): ParsedValue {
  if (value === null || value === undefined) {
    // Default values for empty/missing fields, crucial for consistent row structure
    switch (header) {
      case H_CREDIT_LIMIT:
        return '0.00';
      case H_BIRTHDAY: // Or some other placeholder if an empty date string is not desired
        return '';
      default:
        return '';
    }
  }
  let ruleHeaderKey = ''; // This will be H_NAME, H_ADDRESS, etc., if a match is found.
  for (const expected of EXPECTED_HEADERS) {
    if (expected.toLowerCase() === header.toLowerCase()) {
      ruleHeaderKey = expected; // Found the canonical version (e.g., "Name", "Credit Limit")
      break;
    }
  }
  const processedValue = String(value).trim();

  switch (ruleHeaderKey) {
    case H_POSTCODE:
      // CSV: "3122gg", "4532 AA" -> PRN: "3122gg", "4532 AA"
      // Goal: "3122GG", "4532AA" (consistent casing, no internal space)
      return processedValue.replace(/\s+/g, '').toUpperCase();
    case H_PHONE:
      // CSV/PRN: "020 3849381", "+44 728 889838"
      // Goal: "0203849381", "+44728889838"
      if (processedValue.startsWith('+')) {
        return `+${processedValue.substring(1).replace(/[^\d]/g, '')}`;
      }
      return processedValue.replace(/[^\d]/g, '');
    case H_CREDIT_LIMIT: {
      // CSV provides: "10000", "54.5"
      // PRN parser will pre-process "5450" (cents) to "54.50" (string value in base units)
      // This function then just ensures .toFixed(2) formatting.
      const num = Number.parseFloat(processedValue.replace(',', '.')); // Allow for comma as decimal separator from some sources
      return Number.isNaN(num) ? '0.00' : num.toFixed(2);
    }
    case H_BIRTHDAY: {
      // CSV: "01/01/1987" (DD/MM/YYYY)
      // PRN: "19870101" (YYYYMMDD)
      // Goal: "YYYY-MM-DD"

      // Try DD/MM/YYYY (from CSV)
      let parts = processedValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (parts) {
        const day = parts[1].padStart(2, '0');
        const month = parts[2].padStart(2, '0');
        return `${parts[3]}-${month}-${day}`;
      }

      // Try YYYYMMDD (from PRN)
      parts = processedValue.match(/^(\d{4})(\d{2})(\d{2})$/);
      if (parts) {
        return `${parts[1]}-${parts[2]}-${parts[3]}`;
      }

      // Try YYYY-MM-DD (already normalized or alternate input)
      parts = processedValue.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (parts) {
        const month = parts[2].padStart(2, '0');
        const day = parts[3].padStart(2, '0');
        return `${parts[1]}-${month}-${day}`;
      }
      // If no known date format matches, return the original (trimmed) value or an empty string.
      // console.warn(`Unknown date format for Birthday: "${processedValue}"`);
      return processedValue;
    }
    case H_NAME:
    case H_ADDRESS:
      // These fields are taken as is after trimming, as their internal structure (commas, spaces) is significant.
      return processedValue;
    default:
      return processedValue;
  }
}

export function normalizeRow(
  rawRow: Record<string, any>,
  headersInOrder: readonly string[],
): Record<string, ParsedValue> {
  const normalized: Record<string, ParsedValue> = {};
  for (const header of headersInOrder) {
    // Ensure all expected headers are present in the final normalized row.
    // If a header was missing in rawRow (e.g. PRN column missing), normalizeFieldValue will use its default for undefined.
    normalized[header] = normalizeFieldValue(header, rawRow[header]);
  }
  return normalized;
}
