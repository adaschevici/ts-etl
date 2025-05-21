import { describe, it, expect, beforeEach, afterEach, type Mock, spyOn } from 'bun:test'; // Using bun:test
import { Readable, Transform } from 'node:stream';
import { JsonRenderer } from '../../src/renderers/jsonRenderer.js'; // Adjust path if necessary
import type { ParsedRow, ConversionOptions } from '../../src/types.js'; // Adjust path
// EXPECTED_HEADERS is not used by JsonRenderer, so no need to import or mock it for these tests.

// Helper function to stream ParsedRow objects into JsonRenderer and collect the output string
async function collectJsonOutput(
  renderer: JsonRenderer,
  rowsToParse: ParsedRow[],
): Promise<{ jsonString: string; errors: Error[] }> {
  let jsonChunks: string[] = [];
  const errors: Error[] = [];
  let resolved = false;

  return new Promise((resolveFunc) => {
    const resolve = (result: { jsonString: string; errors: Error[] }) => {
      if (!resolved) {
        resolved = true;
        renderer.removeAllListeners();
        resolveFunc(result);
      }
    };

    renderer.on('data', (chunk: string) => jsonChunks.push(chunk));
    renderer.on('error', (err: Error) => {
      errors.push(err);
      resolve({ jsonString: jsonChunks.join(''), errors });
    });
    renderer.on('end', () => {
      resolve({ jsonString: jsonChunks.join(''), errors });
    });
    renderer.on('close', () => {
      resolve({ jsonString: jsonChunks.join(''), errors });
    });

    try {
      for (const row of rowsToParse) {
        if (renderer.writableEnded || resolved) break;
        renderer.write(row);
      }
      if (!renderer.writableEnded && !resolved) {
        renderer.end();
      } else if (!resolved) {
        resolve({ jsonString: jsonChunks.join(''), errors });
      }
    } catch (e: any) {
      if (!resolved) {
        errors.push(e);
        resolve({ jsonString: jsonChunks.join(''), errors });
      }
    }
  });
}

// Sample ParsedRow data derived from the user's CSV example, after normalization
const sampleNormalizedRows: ParsedRow[] = [
  {
    Name: 'Johnson, John',
    Address: 'Voorstraat 32',
    Postcode: '3122GG',
    Phone: '0203849381',
    'Credit Limit': '10000.00',
    Birthday: '1987-01-01',
  },
  {
    Name: 'Anderson, Paul',
    Address: 'Dorpsplein 3A',
    Postcode: '4532AA',
    Phone: '0303458986',
    'Credit Limit': '109093.00',
    Birthday: '1965-12-03',
  },
  {
    Name: 'Wicket, Steve',
    Address: 'Mendelssohnstraat 54d',
    Postcode: '3423BA', // Assuming 'ba' -> 'BA'
    Phone: '0313398475',
    'Credit Limit': '934.00',
    Birthday: '1964-06-03',
  },
  {
    Name: 'Gibson, Mal',
    Address: 'Vredenburg 21',
    Postcode: '3209DD',
    Phone: '0648958986',
    'Credit Limit': '54.50',
    Birthday: '1978-11-09',
  },
  {
    Name: 'Smith, John',
    Address: 'Børkestraße 32',
    Postcode: '87823',
    Phone: '+44728889838',
    'Credit Limit': '9898.30',
    Birthday: '1999-09-20',
  },
];

describe('JsonRenderer', () => {
  let consoleErrorSpy: Mock<(...args: any[]) => void>;
  const originalJsonStringify = JSON.stringify; // Store original JSON.stringify

  beforeEach(() => {
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    JSON.stringify = originalJsonStringify; // Ensure it's reset before each test
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    JSON.stringify = originalJsonStringify; // Restore original after each test
  });

  it('should output an empty JSON array string for empty input', async () => {
    const renderer = new JsonRenderer();
    const { jsonString, errors } = await collectJsonOutput(renderer, []);

    expect(errors.length).toBe(0);
    expect(jsonString.trim()).toBe('[]');

    let parsedJson;
    try {
      parsedJson = JSON.parse(jsonString);
    } catch (e) {
      /* will fail assertion */
    }
    expect(parsedJson).toEqual([]);
  });

  it('should correctly format a single ParsedRow object', async () => {
    const renderer = new JsonRenderer();
    const testRow: ParsedRow = {
      Name: 'Alice',
      Age: '30', // Assuming Age is also a string after normalization
      City: 'New York',
    };
    const { jsonString, errors } = await collectJsonOutput(renderer, [testRow]);

    expect(errors.length).toBe(0);
    let parsedOutput;
    try {
      parsedOutput = JSON.parse(jsonString);
    } catch (e: any) {
      throw new Error(`Output was not valid JSON: ${jsonString}. Error: ${e.message}`);
    }
    expect(parsedOutput).toEqual([testRow]);
  });

  it('should correctly format multiple simple ParsedRow objects with commas', async () => {
    const renderer = new JsonRenderer();
    const testRows: ParsedRow[] = [
      { Name: 'Alice', Age: '30' },
      { Name: 'Bob', Age: '24' },
      { Name: 'Carol', Age: '35' },
    ];
    const { jsonString, errors } = await collectJsonOutput(renderer, testRows);

    expect(errors.length).toBe(0);
    let parsedOutput;
    try {
      parsedOutput = JSON.parse(jsonString);
    } catch (e: any) {
      throw new Error(`Output was not valid JSON: ${jsonString}. Error: ${e.message}`);
    }
    expect(parsedOutput).toEqual(testRows);
    expect(jsonString).toContain(',\n  ');
    expect(jsonString.startsWith('[\n  ')).toBe(true);
    expect(jsonString.endsWith('\n]\n')).toBe(true);
  });

  it('should correctly format realistic ParsedRow objects derived from CSV data', async () => {
    const renderer = new JsonRenderer();
    // Use a subset of sampleNormalizedRows for this test for brevity if needed
    const testInputRows = sampleNormalizedRows.slice(0, 3); // Using first 3 for example
    const { jsonString, errors } = await collectJsonOutput(renderer, testInputRows);

    expect(errors.length).toBe(0);
    let parsedOutput;
    try {
      parsedOutput = JSON.parse(jsonString);
    } catch (e: any) {
      throw new Error(`Output was not valid JSON: ${jsonString}. Error: ${e.message}`);
    }

    expect(parsedOutput).toBeInstanceOf(Array);
    expect(parsedOutput.length).toBe(testInputRows.length);
    expect(parsedOutput).toEqual(testInputRows); // Deep equality check

    // Check structure for the first element
    expect(parsedOutput[0]).toEqual({
      Name: 'Johnson, John',
      Address: 'Voorstraat 32',
      Postcode: '3122GG',
      Phone: '0203849381',
      'Credit Limit': '10000.00',
      Birthday: '1987-01-01',
    });
  });

  it('should handle ParsedRow with various data types (all strings as per ParsedValue)', async () => {
    const renderer = new JsonRenderer();
    const testRow: ParsedRow = {
      StringField: 'Hello World',
      NumberStringField: '123.45',
      BooleanFieldString: 'true',
      NullStringField: 'null',
      EmptyStringField: '',
      SpecialChars: '<>&"\'',
    };
    const { jsonString, errors } = await collectJsonOutput(renderer, [testRow]);

    expect(errors.length).toBe(0);
    const parsedOutput = JSON.parse(jsonString);
    expect(parsedOutput[0]).toEqual(testRow);
  });

  it('should handle stream ending correctly after pushing data', async () => {
    const renderer = new JsonRenderer();
    const testRows: ParsedRow[] = [{ Name: 'Test' }];
    const { jsonString, errors } = await collectJsonOutput(renderer, testRows);

    expect(errors.length).toBe(0);
    expect(jsonString.trim().endsWith(']')).toBe(true);
    expect(JSON.parse(jsonString).length).toBe(1);
  });

  it('should call _construct once at the beginning (verified by output)', async () => {
    const renderer = new JsonRenderer();
    const { jsonString, errors } = await collectJsonOutput(renderer, []); // Empty input
    expect(errors.length).toBe(0);
    expect(jsonString.trim().startsWith('[')).toBe(true); // Effect of _construct
  });

  it('should call _flush once at the end (verified by output)', async () => {
    const renderer = new JsonRenderer();
    // Spy on the internal method. Note: (renderer as any) is used to access private/protected methods for testing.
    const flushSpy = spyOn(renderer as any, '_flush');
    await collectJsonOutput(renderer, [{ test: 'data' }]);
    expect(flushSpy).toHaveBeenCalledTimes(1);
  });

  it('should emit an error if JSON.stringify fails in _transform', async () => {
    const renderer = new JsonRenderer();
    const circularRow: any = { name: 'Test' };
    circularRow.self = circularRow; // Create a circular reference

    // Manually mock JSON.stringify for this test case
    JSON.stringify = (...args: any[]): string => {
      // Reassign global
      // Only throw for the specific circularRow object or a similar check
      if (args[0] && args[0].self === args[0]) {
        throw new TypeError('Simulated JSON.stringify error (e.g. circular structure)');
      }
      // For other calls (if any within this test's scope), use the original
      return originalJsonStringify.apply(null, args);
    };

    const { errors } = await collectJsonOutput(renderer, [circularRow as ParsedRow]);
    // No need to restore JSON.stringify here, afterEach will do it.

    expect(errors.length).toBe(1);
    expect(errors[0]).toBeInstanceOf(TypeError);
    expect(errors[0].message).toContain('Simulated JSON.stringify error');
  });
});
