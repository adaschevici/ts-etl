import type { ParsedValue } from "./utils/normalization"; // Import the specific type

export const ALLOWED_INPUT_TYPES = ["csv", "prn"] as const; // Keep this as a source of truth
export type InputType = (typeof ALLOWED_INPUT_TYPES)[number];

// export type InputType = 'csv' | 'prn';
export const ALLOWED_OUTPUT_TYPES = ["json", "html"] as const; // Keep this as a source of truth
export type OutputType = (typeof ALLOWED_OUTPUT_TYPES)[number];

// The canonical data structure after parsing AND normalization.
// Keys are the canonical header strings (e.g., "Credit Limit").
// Values are normalized strings.
export type ParsedRow = Record<string, ParsedValue>; // All values are normalized strings

export interface CommandLineOptions {
	inputType: InputType;
	outputType: OutputType;
}

export interface ConversionOptions {
	csvDelimiter?: string; // For CSV input
	// htmlTitle?: string; // Example for HTML output
	// You can add other parser/formatter specific options here
}
