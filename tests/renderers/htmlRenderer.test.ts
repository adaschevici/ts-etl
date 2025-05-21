import { describe, it, expect, spyOn, beforeEach, afterEach, type Mock } from 'bun:test'; // Using bun:test's spyOn
import { Readable, Transform } from 'node:stream';
import { HtmlRenderer } from '../../src/renderers/htmlRenderer.js'; // Adjust path if necessary
import type { ParsedRow, ConversionOptions } from '../../src/types.js'; // Adjust path
// Import the ACTUAL EXPECTED_HEADERS. Tests will now rely on this real value.
import { EXPECTED_HEADERS } from '../../src/utils/normalization.js'; // Adjust path
import { escapeHtml, condenseHtml } from '../../src/utils/string.js'; // Adjust path

// Helper function to stream ParsedRow objects into HtmlRenderer and collect the output string
async function collectHtmlOutput(
  renderer: HtmlRenderer,
  rowsToParse: ParsedRow[],
): Promise<{ html: string; errors: Error[] }> {
  let htmlChunks: string[] = [];
  const errors: Error[] = [];
  let resolved = false;

  return new Promise((resolveFunc) => {
    const resolve = (result: { html: string; errors: Error[] }) => {
      if (!resolved) {
        resolved = true;
        renderer.removeAllListeners();
        resolveFunc(result);
      }
    };

    renderer.on('data', (chunk: string) => htmlChunks.push(chunk));
    renderer.on('error', (err: Error) => {
      errors.push(err);
      resolve({ html: htmlChunks.join(''), errors });
    });
    renderer.on('end', () => {
      resolve({ html: htmlChunks.join(''), errors });
    });
    renderer.on('close', () => {
      resolve({ html: htmlChunks.join(''), errors });
    });

    try {
      for (const row of rowsToParse) {
        if (renderer.writableEnded || resolved) break;
        renderer.write(row);
      }
      if (!renderer.writableEnded && !resolved) {
        renderer.end();
      } else if (!resolved) {
        resolve({ html: htmlChunks.join(''), errors });
      }
    } catch (e: any) {
      if (!resolved) {
        errors.push(e);
        resolve({ html: htmlChunks.join(''), errors });
      }
    }
  });
}

describe('HtmlRenderer', () => {
  // No beforeEach needed for vi.resetModules() anymore

  it('should output basic HTML structure with actual headers for empty input', async () => {
    const renderer = new HtmlRenderer();
    const { html, errors } = await collectHtmlOutput(renderer, []);

    expect(errors.length).toBe(0);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<head>');
    expect(html).toContain('<title>Data Output</title>');
    expect(html).toContain('<body>');
    expect(html).toContain('<h1>Processed Data</h1>');
    expect(html).toContain('<table>');
    expect(html).toContain('<thead>');
    expect(html).toContain('<tr>');
    // Uses the actual EXPECTED_HEADERS imported from normalization.js
    for (const header of EXPECTED_HEADERS) {
      // Basic escape function for comparison, assuming simple strings in EXPECTED_HEADERS
      const escapedHeader = escapeHtml(header);
      expect(html).toContain(`<th>${escapedHeader}</th>`);
    }
    expect(html).toContain('</tr>');
    expect(html).toContain('</thead>');
    expect(html).toContain('<tbody>');
    expect(html).toContain(
      `<td colspan="${EXPECTED_HEADERS.length}" style="text-align:center;">No data available</td>`,
    );
    expect(html).toContain('</tbody>');
    expect(html).toContain('</table>');
    expect(html).toContain('</body>');
    expect(html).toContain('</html>');
  });

  it('should render multiple ParsedRow objects into HTML table rows using actual EXPECTED_HEADERS', async () => {
    const renderer = new HtmlRenderer();
    // Construct testRows ensuring keys match the actual EXPECTED_HEADERS
    const testRows: ParsedRow[] = [
      Object.fromEntries(EXPECTED_HEADERS.map((h, i) => [h, `R1C${i + 1}`])),
      Object.fromEntries(EXPECTED_HEADERS.map((h, i) => [h, `R2C${i + 1}`])),
    ];
    const { html, errors } = await collectHtmlOutput(renderer, testRows);

    expect(errors.length).toBe(0);

    let row1Html = '<tr>';
    EXPECTED_HEADERS.forEach((h, i) => (row1Html += `<td>R1C${i + 1}</td>`));
    row1Html += '</tr>';
    expect(condenseHtml(html)).toContain(row1Html.replace(/\s+/g, ' '));

    let row2Html = '<tr>';
    EXPECTED_HEADERS.forEach((h, i) => (row2Html += `<td>R2C${i + 1}</td>`));
    row2Html += '</tr>';
    expect(condenseHtml(html)).toContain(row2Html.replace(/\s+/g, ' '));
  });

  it('should correctly escape HTML special characters in data', async () => {
    const renderer = new HtmlRenderer();
    // Create a row with special characters. Keys must match actual EXPECTED_HEADERS.
    // We'll assume the first expected header is 'Name' for this example.
    // If EXPECTED_HEADERS is empty, this test might need adjustment or be skipped.
    if (EXPECTED_HEADERS.length === 0) {
      console.warn('Skipping HTML escape test for data as EXPECTED_HEADERS is empty.');
      return;
    }
    const dataRow: ParsedRow = {};
    EXPECTED_HEADERS.forEach((header) => {
      dataRow[header] = 'Default'; // Default value for other headers
    });
    // Set specific value with special characters for the first header
    dataRow[EXPECTED_HEADERS[0]] = 'Data <>&"\'';

    const testRows: ParsedRow[] = [dataRow];
    const { html, errors } = await collectHtmlOutput(renderer, testRows);

    expect(errors.length).toBe(0);

    // Check escaped data for the first cell
    expect(html).toContain(`<td>Data &lt;&gt;&amp;&quot;&#039;</td>`);

    // If your actual EXPECTED_HEADERS contain special characters, they should also be escaped
    // For example, if EXPECTED_HEADERS[0] was "<Name>", the output should be <th>&lt;Name&gt;</th>
    const firstHeaderEscaped = escapeHtml(EXPECTED_HEADERS[0]);
    expect(html).toContain(`<th>${firstHeaderEscaped}</th>`);
  });

  it('should handle ParsedRow with missing keys (should render empty cell for those EXPECTED_HEADERS)', async () => {
    const renderer = new HtmlRenderer();
    // Create a row missing some of the EXPECTED_HEADERS
    const partialRow: ParsedRow = {};
    if (EXPECTED_HEADERS.length > 0) {
      partialRow[EXPECTED_HEADERS[0]] = 'Value1';
    }
    const testRows: ParsedRow[] = [partialRow];
    const { html, errors } = await collectHtmlOutput(renderer, testRows);

    expect(errors.length).toBe(0);

    let expectedRowContent = '<tr>';
    EXPECTED_HEADERS.forEach((header) => {
      if (header === EXPECTED_HEADERS[0] && EXPECTED_HEADERS.length > 0) {
        expectedRowContent += '<td>Value1</td>';
      } else {
        expectedRowContent += '<td></td>'; // Empty cell for missing data
      }
    });
    expectedRowContent += '</tr>';
    expect(condenseHtml(html)).toContain(expectedRowContent.replace(/\s+/g, ' '));
  });

  it('should handle ParsedRow with extra keys (should ignore them)', async () => {
    const renderer = new HtmlRenderer();
    const rowWithExtra: ParsedRow = {
      ...Object.fromEntries(EXPECTED_HEADERS.map((h, i) => [h, `V${i + 1}`])),
      ExtraKey: 'ExtraValue',
    };
    const testRows: ParsedRow[] = [rowWithExtra];
    const { html, errors } = await collectHtmlOutput(renderer, testRows);

    expect(errors.length).toBe(0);

    let expectedRowContent = '<tr>';
    EXPECTED_HEADERS.forEach((h, i) => (expectedRowContent += `<td>V${i + 1}</td>`));
    expectedRowContent += '</tr>';
    expect(condenseHtml(html)).toContain(expectedRowContent.replace(/\s+/g, ' '));

    expect(html).not.toContain('ExtraValue');
    expect(html).not.toContain('ExtraKey');
  });

  it('should correctly close all HTML tags when stream ends', async () => {
    const renderer = new HtmlRenderer();
    const testRows: ParsedRow[] = [
      Object.fromEntries(EXPECTED_HEADERS.map((h, i) => [h, `R1C${i + 1}`])),
    ];
    const { html, errors } = await collectHtmlOutput(renderer, testRows);

    expect(errors.length).toBe(0);
    expect(html.trim().endsWith('</html>')).toBe(true);
    expect(html).toContain('</tbody>');
    expect(html).toContain('</table>');
    expect(html).toContain('</body>');
  });

  it('should output "No data available" message if _flush is called before any data row is processed', async () => {
    const renderer = new HtmlRenderer();
    const { html, errors } = await collectHtmlOutput(renderer, []);

    expect(errors.length).toBe(0);
    expect(html).toContain(
      `<td colspan="${EXPECTED_HEADERS.length}" style="text-align:center;">No data available</td>`,
    );
  });
});
