// src/parsers/index.ts (Example of a more extensible factory)
import type { Transform } from 'node:stream';
import type { ConversionOptions, InputType } from '../types.js'; // Your canonical InputType
import { CsvParser } from './csvParser.js';
import { PrnParser } from './prnParser.js';
import type { ParserConstructor, ParserRegistry } from './parser.types.js'; // Your parser types

const parserRegistry: ParserRegistry = new Map();

// Function to register a new parser strategy
export function registerParser(type: InputType, constructor: ParserConstructor): void {
  if (parserRegistry.has(type)) {
    console.warn(`Parser type "${type}" is already registered. Overwriting.`);
  }
  parserRegistry.set(type, constructor);
}

// Register your known parsers
registerParser('csv', CsvParser);
registerParser('prn', PrnParser);

export function createParser(
  inputType: InputType,
  options: ConversionOptions,
): Transform {
  const ParserConstructor = parserRegistry.get(inputType);
  if (!ParserConstructor) {
    throw new Error(`Unsupported input type: ${inputType}. No parser registered.`);
  }
  return new ParserConstructor(options);
}
