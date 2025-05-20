import type { Transform } from "node:stream"; // Bun implements Node.js stream API
import type { InputType } from "../types"; // Your canonical InputType

// Option 1: Interface for a class that IS a Transform stream
export interface IParserStream extends Transform {}

// Option 2: A factory function type that returns a Transform stream
// This is often simpler for strategies.
export type ParserStreamFactory = () => Transform;
export interface CsvParserConstructorOptions {
	delimiter?: string;
}

// Define a type for parser constructor or a factory function for a parser
export type ParserConstructor = new () => Transform; // Or a more specific interface if parsers take options
export type ParserRegistry = Map<InputType, ParserConstructor>;
