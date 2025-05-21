import { Transform } from 'node:stream';
import type { ParsedRow, ConversionOptions } from '../types.js'; // Adjust path as necessary
import { EXPECTED_HEADERS } from '../utils/normalization.js'; // Adjust path as necessary
import { escapeHtml } from '../utils/string.js'; // Adjust path as necessary

export class HtmlRenderer extends Transform {
  private firstDataRowProcessed: boolean = false;
  private headersWritten: boolean = false;

  /**
   * Constructs an HtmlRenderer instance.
   * @param options - Conversion options, currently unused by HtmlRenderer but included for consistency.
   */
  constructor(options: ConversionOptions = {}) {
    // Input is objects (ParsedRow), output is strings (HTML)
    super({ writableObjectMode: true, readableObjectMode: false });
  }

  /**
   * Called once when the stream is initialized.
   * Writes the initial HTML structure and table headers.
   */
  _construct(callback: (error?: Error | null) => void): void {
    try {
      this.push('<!DOCTYPE html>\n');
      this.push('<html lang="en">\n');
      this.push('<head>\n');
      this.push('  <meta charset="UTF-8">\n');
      this.push(
        '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n',
      );
      this.push('  <title>Data Output</title>\n');
      // Basic styling for readability
      this.push('  <style>\n');
      this.push('    body { font-family: sans-serif; margin: 20px; }\n');
      this.push(
        '    table { border-collapse: collapse; width: 100%; margin-top: 20px; }\n',
      );
      this.push(
        '    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }\n',
      );
      this.push('    th { background-color: #f2f2f2; }\n');
      this.push('    tr:nth-child(even) { background-color: #f9f9f9; }\n');
      this.push('  </style>\n');
      this.push('</head>\n');
      this.push('<body>\n');
      this.push('  <h1>Processed Data</h1>\n');
      this.push('  <table>\n');

      // Write table headers
      this.push('    <thead>\n');
      this.push('      <tr>\n');
      for (const header of EXPECTED_HEADERS) {
        this.push(`        <th>${escapeHtml(header)}</th>\n`);
      }
      this.push('      </tr>\n');
      this.push('    </thead>\n');
      this.push('    <tbody>\n');
      this.headersWritten = true;
      callback();
    } catch (error: any) {
      callback(error);
    }
  }

  /**
   * Transforms a ParsedRow object into an HTML table row string.
   * @param row - The ParsedRow object from the parser, or potentially null/undefined if stream internals pass such markers.
   * @param encoding - The encoding (unused as input is object mode).
   * @param callback - Callback to signal completion or error.
   */
  _transform(
    row: ParsedRow | null | undefined, // Explicitly allow null or undefined for the check
    encoding: BufferEncoding,
    callback: (error?: Error | null, data?: any) => void,
  ): void {
    try {
      if (!this.headersWritten) {
        return callback(
          new Error('HTML headers were not written before transforming data.'),
        );
      }

      // Only process and set firstDataRowProcessed if 'row' is an actual data object.
      // This guards against potential null/undefined chunks that might trigger _transform
      // in some stream edge cases, especially when ending an empty objectMode stream.
      if (row && typeof row === 'object') {
        this.firstDataRowProcessed = true;
        this.push('      <tr>\n');
        for (const header of EXPECTED_HEADERS) {
          // Ensure row[header] access is safe if row is a valid object
          const value =
            (row as ParsedRow)[header] !== undefined ? (row as ParsedRow)[header] : '';
          this.push(`        <td>${escapeHtml(String(value))}</td>\n`);
        }
        this.push('      </tr>\n');
      }
      callback();
    } catch (error: any) {
      callback(error);
    }
  }

  /**
   * Called when all data has been written to the stream.
   * Writes the closing HTML tags.
   */
  _flush(callback: (error?: Error | null, data?: any) => void): void {
    try {
      if (!this.headersWritten) {
        // This case implies _construct itself failed or was bypassed,
        // which should ideally result in an error state for the stream.
        // If we reach _flush and headersWritten is false, something is very wrong.
        // For robustness, we could avoid pushing closing tags or push minimal valid HTML.
        // However, the primary fix is for the "No data available" row.
      }
      // This condition should now correctly evaluate for empty inputs
      if (!this.firstDataRowProcessed && this.headersWritten) {
        // Ensure EXPECTED_HEADERS.length is not zero to avoid colspan="0" if headers are empty
        const colspan = EXPECTED_HEADERS.length > 0 ? EXPECTED_HEADERS.length : 1;
        this.push(
          '      <tr><td colspan="' +
            colspan +
            '" style="text-align:center;">No data available</td></tr>\n',
        );
      }
      this.push('    </tbody>\n');
      this.push('  </table>\n');
      this.push('</body>\n');
      this.push('</html>\n');
      callback();
    } catch (error: any) {
      callback(error);
    }
  }
}
