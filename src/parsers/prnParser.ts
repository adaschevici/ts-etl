import { Transform } from 'node:stream';
import type { ParsedRow, ConversionOptions } from '../types.js'; // Assuming types.ts is in ../
import {
  normalizeRow,
  EXPECTED_HEADERS,
  H_CREDIT_LIMIT,
} from '../utils/normalization.js'; // Assuming normalization.js is in ../utils/

// --- Debug Logger Utility (copied from index.ts for standalone use if needed, or import it) ---
const IS_DEBUG_MODE = Boolean(
  process.env.DEBUG && process.env.DEBUG !== 'false' && process.env.DEBUG !== '0',
);

function prnDebugLog(...args: any[]): void {
  if (IS_DEBUG_MODE) {
    console.error('PRN_DEBUG:', ...args);
  }
}
// --- End Debug Logger Utility ---

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

  constructor(options: ConversionOptions = {}) {
    super({ objectMode: true });
    prnDebugLog('PrnParser instantiated. Options:', options);
  }

  private processHeaderLine(line: string): void {
    prnDebugLog(
      `processHeaderLine received line (length ${line.length}):`,
      JSON.stringify(line),
    );
    if (this.headerProcessed) {
      prnDebugLog('Header already processed, returning.');
      return;
    }

    const trimmedLine = line.trimEnd(); // Crucial: Do not trimStart for indexOf based on start positions
    prnDebugLog(
      `trimmedLine for header processing (length ${trimmedLine.length}):`,
      JSON.stringify(trimmedLine),
    );
    this.columnSpecs = [];

    const foundHeaderPositions: { name: string; start: number }[] = [];

    // Find all occurrences of EXPECTED_HEADERS first
    for (const headerName of EXPECTED_HEADERS) {
      let searchFrom = 0;
      let foundIndex;
      // Loop to find all occurrences in case a header string could appear multiple times (though unlikely for distinct headers)
      // For this PRN, we expect each header once.
      foundIndex = trimmedLine.indexOf(headerName, searchFrom); // Start search for each header from beginning for simplicity, then sort

      if (foundIndex !== -1) {
        // Check if this found header (by name) is already in foundHeaderPositions
        // This is to handle cases where a shorter header name might be part of a longer one,
        // and we want the longest specific match if possible, or just the first found.
        // For now, we take the first one found. Sorting by start index later handles order.
        if (!foundHeaderPositions.some((fh) => fh.name === headerName)) {
          prnDebugLog(`Found header "${headerName}" at index ${foundIndex}`);
          foundHeaderPositions.push({ name: headerName, start: foundIndex });
        } else {
          prnDebugLog(
            `Header "${headerName}" already found, skipping subsequent match at ${foundIndex} (if any).`,
          );
        }
      } else {
        prnDebugLog(`Warning: Expected header "${headerName}" not found in header line.`);
      }
    }

    prnDebugLog(
      'Found header positions (before sort):',
      JSON.stringify(foundHeaderPositions),
    );

    // Sort the found headers by their start index. This is crucial.
    foundHeaderPositions.sort((a, b) => a.start - b.start);
    prnDebugLog(
      'Found header positions (after sort):',
      JSON.stringify(foundHeaderPositions),
    );

    // Now, build the columnSpecs using the sorted found headers.
    // The end of one column is the start of the next found column.
    for (let i = 0; i < foundHeaderPositions.length; i++) {
      const currentHeader = foundHeaderPositions[i];
      let endIndex: number;
      if (i < foundHeaderPositions.length - 1) {
        // End is the start of the next physically appearing header in the sorted list
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

    prnDebugLog('Final columnSpecs:', JSON.stringify(this.columnSpecs));

    if (this.columnSpecs.length === 0 && trimmedLine.length > 0) {
      this.emit(
        'error',
        new Error(
          'PRN Error: Could not derive any column specifications from PRN header line. Ensure headers match EXPECTED_HEADERS.',
        ),
      );
      return;
    }

    const foundHeadersCount = this.columnSpecs.length;
    if (foundHeadersCount < EXPECTED_HEADERS.length && trimmedLine.length > 0) {
      const missing = EXPECTED_HEADERS.filter(
        (eh) => !this.columnSpecs.find((cs) => cs.name === eh),
      );
      if (missing.length > 0) {
        console.warn(
          `PRN Parser Warning: Not all EXPECTED_HEADERS were mapped to columns. Missing/unmapped: ${missing.join(', ')}`,
        );
      }
    }
    this.headerProcessed = true;
  }

  private processDataLine(line: string): void {
    prnDebugLog(
      `processDataLine received line (length ${line.length}):`,
      JSON.stringify(line.substring(0, 100)) + '...',
    ); // Log start of line
    if (line.trim() === '') {
      if (this.headerProcessed) return;
    }

    const rawRecordIntermediate: Record<string, string> = {};

    for (const spec of this.columnSpecs) {
      prnDebugLog(
        `Processing spec: ${spec.name}, start: ${spec.start}, end: ${spec.end}`,
      );
      const valueSlice =
        spec.start < line.length
          ? line.substring(spec.start, Math.min(spec.end, line.length))
          : '';
      prnDebugLog(`  -> valueSlice for ${spec.name}:`, JSON.stringify(valueSlice));
      let extractedValue = valueSlice.trim();
      prnDebugLog(
        `  -> extractedValue (trimmed) for ${spec.name}:`,
        JSON.stringify(extractedValue),
      );

      if (spec.name === H_CREDIT_LIMIT) {
        const creditInt = parseInt(extractedValue, 10);
        if (!isNaN(creditInt)) {
          extractedValue = (creditInt / 100).toFixed(2);
        } else {
          extractedValue = '';
        }
        prnDebugLog(
          `  -> Credit Limit after pre-processing:`,
          JSON.stringify(extractedValue),
        );
      }
      rawRecordIntermediate[spec.name] = extractedValue;
    }

    prnDebugLog(
      'Raw record intermediate before normalizeRow:',
      JSON.stringify(rawRecordIntermediate),
    );
    const normalizedRecord = normalizeRow(rawRecordIntermediate, EXPECTED_HEADERS);
    prnDebugLog('Pushing normalized record:', JSON.stringify(normalizedRecord));
    this.push(normalizedRecord);
  }

  private handleLine(line: string): void {
    if (!this.headerProcessed) {
      if (line.trim() !== '') {
        this.processHeaderLine(line);
      }
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
    const stringChunk = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    prnDebugLog(
      `_transform received chunk (length ${stringChunk.length}), type: ${typeof chunk}. First 50 chars:`,
      JSON.stringify(stringChunk.substring(0, 50)),
    );

    this.buffer += stringChunk;
    let newlineIndex;
    while ((newlineIndex = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.substring(0, newlineIndex);
      this.buffer = this.buffer.substring(newlineIndex + 1);
      this.handleLine(line);
    }
    callback();
  }

  _flush(callback: (error?: Error | null, data?: any) => void): void {
    prnDebugLog('_flush called. Remaining buffer length:', this.buffer.length);
    if (this.buffer.length > 0) {
      this.handleLine(this.buffer);
      this.buffer = '';
    }
    if (!this.firstChunkProcessed && !this.headerProcessed) {
      prnDebugLog('Flushing an empty/unprocessed stream.');
    }
    prnDebugLog('PrnParser flush complete.');
    callback();
  }
}
