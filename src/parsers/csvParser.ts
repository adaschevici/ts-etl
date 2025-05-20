// src/parsers/csvParser.ts
import { Transform } from 'node:stream';
import { parse, Options as CsvParseOptions } from 'csv-parse';
import type { ParsedRow, ConversionOptions } from '../types.js';
import { normalizeFieldValue, EXPECTED_HEADERS } from '../utils/normalization.js';
import type { ParsedValue } from '../utils/normalization.js';

export class CsvParser extends Transform {
  private parser: Transform;
  private firstChunkProcessed = false;
  private csvHeaders: string[] = []; // Store the headers as found in the CSV file

  constructor(options: ConversionOptions = {}) {
    super({ objectMode: true });

    const csvParseLibOptions: CsvParseOptions = {
      // Options for the 'csv-parse' library
      columns: (headerRow: string[]) => {
        this.csvHeaders = headerRow.map((h) => String(h).trim());
        return this.csvHeaders;
      },
      skip_empty_lines: true,
      trim: false,
      cast: (rawValue: string, context) => {
        if (context.header) {
          return String(rawValue).trim();
        }
        return normalizeFieldValue(context.column as string, rawValue);
      },
      on_record: (castedRecord: Record<string, ParsedValue>, context: any) => {
        const finalRecord: ParsedRow = {};
        for (const expectedHeader of EXPECTED_HEADERS) {
          const actualCsvHeaderKey = this.csvHeaders.find(
            (csvH) => csvH.toLowerCase() === expectedHeader.toLowerCase(),
          );
          if (actualCsvHeaderKey && castedRecord[actualCsvHeaderKey] !== undefined) {
            finalRecord[expectedHeader] = castedRecord[actualCsvHeaderKey];
          } else {
            finalRecord[expectedHeader] = normalizeFieldValue(expectedHeader, undefined);
          }
        }
        return finalRecord;
      },
    };

    // Use the provided delimiter, or default to comma
    csvParseLibOptions.delimiter = options.csvDelimiter || ',';

    this.parser = parse(csvParseLibOptions);

    this.parser.on('data', (finalRecordWithExpectedHeaders: ParsedRow) => {
      this.push(finalRecordWithExpectedHeaders);
    });

    this.parser.on('error', (err) => {
      this.emit('error', new Error(`CSV parsing error: ${err.message}`));
    });

    this.parser.on('end', () => {
      if (
        !this.firstChunkProcessed &&
        this.writableLength === 0 &&
        this.readableLength === 0
      ) {
        this.push(null); // End stream correctly for empty input
      }
    });
  }

  _transform(
    chunk: any,
    encoding: BufferEncoding,
    callback: (error?: Error | null, data?: any) => void,
  ): void {
    this.firstChunkProcessed = true;
    if (!this.parser.write(chunk)) {
      this.parser.once('drain', callback);
    } else {
      process.nextTick(callback);
    }
  }

  _flush(callback: (error?: Error | null, data?: any) => void): void {
    this.parser.end(() => {
      callback();
    });
  }
}
