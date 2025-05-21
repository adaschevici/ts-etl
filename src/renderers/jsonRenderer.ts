import { Transform } from 'node:stream';
import type { ParsedRow, ConversionOptions } from '../types.js'; // Adjust path as necessary

export class JsonRenderer extends Transform {
  private firstRowProcessed: boolean = false;

  constructor(options: ConversionOptions = {}) {
    super({ writableObjectMode: true, readableObjectMode: false });
  }

  _construct(callback: (error?: Error | null) => void): void {
    // We will conditionally push the opening bracket in _transform or _flush
    // to handle the "[]" case for empty inputs perfectly.
    callback();
  }

  _transform(
    row: ParsedRow,
    encoding: BufferEncoding,
    callback: (error?: Error | null, data?: any) => void,
  ): void {
    try {
      if (!this.firstRowProcessed) {
        this.push('[\n  ' + JSON.stringify(row)); // Add opening bracket before the first item
      } else {
        this.push(',\n  ' + JSON.stringify(row)); // Add comma for subsequent items
      }
      this.firstRowProcessed = true;
      callback();
    } catch (error: any) {
      callback(error);
    }
  }

  _flush(callback: (error?: Error | null, data?: any) => void): void {
    try {
      if (!this.firstRowProcessed) {
        // No rows were processed, output a clean empty array string
        this.push('[]');
      } else {
        // Rows were processed, close the array
        this.push('\n]\n');
      }
      callback();
    } catch (error: any) {
      callback(error);
    }
  }
}
