import { Transform } from 'node:stream';
import type { ParsedRow, ConversionOptions } from '../types.js'; // Assuming types.ts is in ../
import {
  normalizeRow,
  EXPECTED_HEADERS,
  H_CREDIT_LIMIT,
  // H_BIRTHDAY is not strictly needed here as normalizeFieldValue handles its PRN format
} from '../utils/normalization.js'; // Assuming normalization.js is in ../utils/

interface ColumnSpec {
  name: string; // Canonical header name from EXPECTED_HEADERS
  start: number;
  end: number;
}

export class PrnParser extends Transform {
  private columnSpecs: ColumnSpec[] = [];
  private buffer: string = '';
  private headerProcessed: boolean = false;
  private firstChunkProcessed: boolean = false;

  /**
   * Constructs a PrnParser instance.
   * @param options - Conversion options, currently unused by PrnParser but included for consistency.
   */
  constructor(options: ConversionOptions = {}) {
    super({ objectMode: true }); // Output will be objects (ParsedRow)
  }

  /**
   * Processes the header line to determine column boundaries.
   * This version robustly finds all expected headers and uses their start positions
   * to define column boundaries.
   * @param line - The header line from the PRN file.
   */
  private processHeaderLine(line: string): void {
    if (this.headerProcessed) return;

    const trimmedLine = line.trimEnd(); // Important to not trim start for indexOf
    this.columnSpecs = [];

    const foundHeaderPositions: { name: string; start: number }[] = [];

    // Find the starting position of each EXPECTED_HEADER in the trimmed header line.
    // We search for them in the order they are defined in EXPECTED_HEADERS,
    // advancing the search offset to ensure we find distinct occurrences if headers could be substrings of each other
    // (though less likely with distinct full header names).
    let currentSearchOffset = 0;
    for (const headerName of EXPECTED_HEADERS) {
      const startIndex = trimmedLine.indexOf(headerName, currentSearchOffset);
      if (startIndex !== -1) {
        foundHeaderPositions.push({ name: headerName, start: startIndex });
        // Advance search offset past the beginning of the found header string to avoid re-matching parts of it
        // if headers could be similar (e.g. "Date" and "Date Created").
        // Using start of found header + 1 is a safe bet.
        currentSearchOffset = startIndex + 1;
      } else {
        console.warn(
          `PRN Parser Warning: Expected header "${headerName}" not found in header line: "${trimmedLine}" (searched from index ${currentSearchOffset - 1}).`,
        );
      }
    }

    // Sort the found headers by their start index. This is crucial if the PRN file
    // could have headers in a different order than EXPECTED_HEADERS, or if the
    // indexOf search above wasn't strictly sequential (though it is now).
    foundHeaderPositions.sort((a, b) => a.start - b.start);

    // Now, build the columnSpecs using the sorted found headers.
    // The end of one column is the start of the next found column.
    for (let i = 0; i < foundHeaderPositions.length; i++) {
      const currentHeader = foundHeaderPositions[i];
      let endIndex: number;
      if (i < foundHeaderPositions.length - 1) {
        endIndex = foundHeaderPositions[i + 1].start;
      } else {
        // This is the last header found; it extends to the end of the line.
        endIndex = trimmedLine.length;
      }
      this.columnSpecs.push({
        name: currentHeader.name, // This is the canonical name from EXPECTED_HEADERS
        start: currentHeader.start,
        end: endIndex,
      });
    }

    if (this.columnSpecs.length === 0 && trimmedLine.length > 0) {
      this.emit(
        'error',
        new Error(
          'PRN Error: Could not derive any column specifications from PRN header line. Ensure headers match EXPECTED_HEADERS.',
        ),
      );
      return;
    }

    console.log(this.columnSpecs);

    const foundHeadersCount = this.columnSpecs.length;
    if (foundHeadersCount < EXPECTED_HEADERS.length && trimmedLine.length > 0) {
      const missing = EXPECTED_HEADERS.filter(
        (eh) => !this.columnSpecs.find((cs) => cs.name === eh),
      );
      if (missing.length > 0) {
        console.warn(
          `Not all EXPECTED_HEADERS were found or mapped. Missing/unmapped: ${missing.join(', ')}`,
        );
      }
    }

    this.headerProcessed = true;
  }

  /**
   * Processes a data line using the derived column specifications.
   * @param line - A data line from the PRN file.
   */
  private processDataLine(line: string): void {
    if (line.trim() === '') {
      if (this.headerProcessed) return; // Skip empty lines only after header is processed
    }

    const rawRecordIntermediate: Record<string, string> = {};

    for (const spec of this.columnSpecs) {
      const valueSlice =
        spec.start < line.length
          ? line.substring(spec.start, Math.min(spec.end, line.length))
          : '';
      let extractedValue = valueSlice.trim();

      if (spec.name === H_CREDIT_LIMIT) {
        const creditInt = parseInt(extractedValue, 10);
        if (!isNaN(creditInt)) {
          extractedValue = (creditInt / 100).toFixed(2);
        } else {
          extractedValue = ''; // Let normalizeFieldValue handle default
        }
      }
      rawRecordIntermediate[spec.name] = extractedValue;
    }

    const normalizedRecord = normalizeRow(rawRecordIntermediate, EXPECTED_HEADERS);
    this.push(normalizedRecord);
  }

  /**
   * Handles a line of text from the input stream.
   * @param line - The line to process.
   */
  private handleLine(line: string): void {
    if (!this.headerProcessed) {
      if (line.trim() !== '') {
        this.processHeaderLine(line);
      }
      // If it was the header line or an empty line before header, don't process as data.
      // If processHeaderLine emitted an error, the stream might stop anyway.
      return;
    }
    this.processDataLine(line);
  }

  _transform(
    chunk: any,
    encoding: BufferEncoding,
    callback: (error?: Error | null, data?: any) => void,
  ): void {
    this.firstChunkProcessed = true;
    this.buffer += chunk.toString();
    let newlineIndex;
    while ((newlineIndex = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.substring(0, newlineIndex);
      this.buffer = this.buffer.substring(newlineIndex + 1);
      this.handleLine(line);
    }
    callback();
  }

  _flush(callback: (error?: Error | null, data?: any) => void): void {
    if (this.buffer.length > 0) {
      this.handleLine(this.buffer);
      this.buffer = '';
    }
    if (!this.firstChunkProcessed && !this.headerProcessed) {
      // Correctly handles empty input.
    }
    callback();
  }
}
