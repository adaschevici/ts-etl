import type { Transform } from 'node:stream'; // Bun implements Node.js stream API
import type { ConversionOptions, InputType } from '../types.js'; // Your canonical InputType

// Option 2: A factory function type that returns a Transform stream
// This is often simpler for strategies.
export type ParserStreamFactory = () => Transform;
export interface CsvParserConstructorOptions {
  delimiter?: string;
}

// Define a type for parser constructor or a factory function for a parser
export type ParserConstructor = new (options: ConversionOptions) => Transform; // Or a more specific interface if parsers take options
export type ParserRegistry = Map<InputType, ParserConstructor>;
