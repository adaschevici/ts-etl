import { describe, it, expect, spyOn, beforeEach, afterEach, type Mock } from 'bun:test'; // Import spyOn and Mock type
import { Readable, Transform } from 'node:stream';
import { PrnParser } from '../../src/parsers/prnParser.js'; // Adjust path as necessary
import type { ParsedRow, ConversionOptions } from '../../src/types.js'; // Adjust path
// Import the ACTUAL normalization utilities. We are testing their integration with PrnParser.
import {
  EXPECTED_HEADERS,
  normalizeFieldValue, // Used for asserting default values
  H_NAME,
  H_ADDRESS,
  H_POSTCODE,
  H_PHONE,
  H_CREDIT_LIMIT,
  H_BIRTHDAY,
} from '../../src/utils/normalization.js'; // Adjust path

// Helper function to stream data into PrnParser and collect the output
async function collectStreamOutput(
  parser: Transform,
  prnInput: string[] | string,
): Promise<{ data: ParsedRow[]; errors: Error[] }> {
  const data: ParsedRow[] = [];
  const errors: Error[] = [];
  let settled = false; // To ensure the promise settles only once

  // Function to clean up listeners
  const cleanupListeners = () => {
    parser.removeAllListeners('data');
    parser.removeAllListeners('error');
    parser.removeAllListeners('end');
    parser.removeAllListeners('close');
  };

  return new Promise((resolveFunc, rejectFunc) => {
    // Added rejectFunc for clarity, though we aim to resolve
    const settlePromise = (result: { data: ParsedRow[]; errors: Error[] }) => {
      if (!settled) {
        settled = true;
        cleanupListeners();
        resolveFunc(result);
      }
    };

    const handleError = (err: Error) => {
      if (!settled) {
        errors.push(err);
        // Even on error, we resolve the promise with the collected errors
        // This matches the original intent of returning { data, errors }
        settlePromise({ data, errors });
      }
    };

    parser.on('data', (row: ParsedRow) => {
      if (settled) return; // Don't collect data if already settled (e.g., due to an error)
      data.push(row);
    });

    parser.on('error', handleError);

    parser.on('end', () => {
      settlePromise({ data, errors });
    });

    parser.on('close', () => {
      settlePromise({ data, errors });
    });

    // Perform stream operations within a try block to catch synchronous errors
    try {
      if (Array.isArray(prnInput)) {
        for (const chunk of prnInput) {
          if (parser.writableEnded || settled) break;
          parser.write(chunk);
        }
      } else {
        if (!parser.writableEnded && !settled) {
          parser.write(prnInput);
        }
      }

      // Only call end if the stream hasn't already been settled (e.g., by an error)
      // and is still writable.
      if (!parser.writableEnded && !settled) {
        parser.end();
      } else if (!settled) {
        // If it's ended or errored but our promise hasn't settled yet
        // (e.g. 'end'/'close' event hasn't fired after an error),
        // we should ensure it settles. This case is less likely with the current setup
        // but adds robustness.
        settlePromise({ data, errors });
      }
    } catch (e: any) {
      // This catch is for synchronous errors during .write() or .end()
      if (!settled) {
        // If a sync error happens before any async event settled the promise
        errors.push(e);
        settlePromise({ data, errors }); // Resolve with the error
      } else {
        // If already settled, this error is likely a secondary issue, log it for debugging tests
        console.error('Secondary error in collectStreamOutput after promise settled:', e);
      }
    }
  });
}

const samplePrnData = `Name            Address               Postcode Phone         Credit Limit Birthday
Johnson, John   Voorstraat 32         3122gg   020 3849381        1000000 19870101
Anderson, Paul  Dorpsplein 3A         4532 AA  030 3458986       10909300 19651203
Wicket, Steve   Mendelssohnstraat 54d 3423 ba  0313-398475          93400 19640603
Benetar, Pat    Driehoog 3zwart       2340 CC  06-28938945           5400 19640904
Gibson, Mal     Vredenburg 21         3209 DD  06-48958986           5450 19781109
Friendly, User  Sint Jansstraat 32    4220 EE  0885-291029           6360 19800810
Smith, John     Børkestraße 32        87823    +44 728 889838      989830 19990920`;

describe('PrnParser with Sample Data and Real Normalization', () => {
  // Declare types for the spy objects
  let consoleWarnSpy: Mock<(...args: any[]) => void>;
  let consoleErrorSpy: Mock<(...args: any[]) => void>;

  beforeEach(() => {
    // Spy on console methods using bun:test's spyOn
    consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore the original console methods
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should parse the full sample PRN data correctly', async () => {
    const parser = new PrnParser();
    const { data, errors } = await collectStreamOutput(parser, samplePrnData);

    expect(errors.length).toBe(0);
    expect(data.length).toBe(7);

    // Check first record based on assumed normalization rules
    expect(data[0]).toEqual({
      [H_NAME]: 'Johnson, John',
      [H_ADDRESS]: 'Voorstraat 32',
      [H_POSTCODE]: '3122GG',
      [H_PHONE]: '0203849381',
      [H_CREDIT_LIMIT]: '10000.00',
      [H_BIRTHDAY]: '1987-01-01',
    });

    // Check second record
    expect(data[1]).toEqual({
      [H_NAME]: 'Anderson, Paul',
      [H_ADDRESS]: 'Dorpsplein 3A',
      [H_POSTCODE]: '4532AA',
      [H_PHONE]: '0303458986',
      [H_CREDIT_LIMIT]: '109093.00',
      [H_BIRTHDAY]: '1965-12-03',
    });

    // Check a record with decimal in original credit limit (after pre-processing)
    expect(data[4]).toEqual({
      // Gibson, Mal
      [H_NAME]: 'Gibson, Mal',
      [H_ADDRESS]: 'Vredenburg 21',
      [H_POSTCODE]: '3209DD',
      [H_PHONE]: '0648958986',
      [H_CREDIT_LIMIT]: '54.50',
      [H_BIRTHDAY]: '1978-11-09',
    });

    // Check last record with special characters and international phone
    expect(data[6]).toEqual({
      // Smith, John
      [H_NAME]: 'Smith, John',
      [H_ADDRESS]: 'Børkestraße 32',
      [H_POSTCODE]: '87823',
      [H_PHONE]: '+44728889838',
      [H_CREDIT_LIMIT]: '9898.30',
      [H_BIRTHDAY]: '1999-09-20',
    });
  });

  it('should handle PRN data with slightly misaligned data but correct headers', async () => {
    const misalignedData = `Name            Address               Postcode Phone         Credit Limit Birthday
Johnson, John      Voorstraat 32         3122gg   020 3849381        1000000 19870101
Anderson, Paul  Dorpsplein 3A         4532 AA  030 3458986       10909300 19651203`;
    const parser = new PrnParser();
    const { data, errors } = await collectStreamOutput(parser, misalignedData);

    expect(errors.length).toBe(0);
    expect(data.length).toBe(2);
    expect(data[0][H_NAME]).toBe('Johnson, John');
    expect(data[0][H_ADDRESS]).toBe('Voorstraat 32');
    expect(data[1][H_NAME]).toBe('Anderson, Paul');
    expect(data[1][H_ADDRESS]).toBe('Dorpsplein 3A');
  });

  it('should provide default normalized values for EXPECTED_HEADERS if columns are missing in PRN specs (e.g. due to missing header)', async () => {
    const prnInputMissingHeaders = `Name             Postcode Credit Limit Birthday
Partial User     PC123       50000     20020202`;
    const parser = new PrnParser();
    const { data, errors } = await collectStreamOutput(parser, prnInputMissingHeaders);

    expect(errors.length).toBe(0);
    expect(data.length).toBe(1);
    const record = data[0];

    expect(record[H_NAME]).toBe('Partial User');
    expect(record[H_POSTCODE]).toBe('PC123');
    expect(record[H_CREDIT_LIMIT]).toBe('500.00');
    expect(record[H_BIRTHDAY]).toBe('2002-02-02');

    expect(record[H_ADDRESS]).toBe(normalizeFieldValue(H_ADDRESS, undefined));
    expect(record[H_PHONE]).toBe(normalizeFieldValue(H_PHONE, undefined));

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(`Expected header "${H_ADDRESS}" not found`),
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(`Expected header "${H_PHONE}" not found`),
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        `Not all EXPECTED_HEADERS were found or mapped. Missing/unmapped: ${H_ADDRESS}, ${H_PHONE}`,
      ),
    );
  });

  it('should handle empty input correctly', async () => {
    const parser = new PrnParser();
    const { data, errors } = await collectStreamOutput(parser, '');
    expect(errors.length).toBe(0);
    expect(data.length).toBe(0);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('should handle input with only headers correctly (no data rows)', async () => {
    const headerOnly = samplePrnData.split('\n')[0];
    const parser = new PrnParser();
    const { data, errors } = await collectStreamOutput(parser, headerOnly);
    expect(errors.length).toBe(0);
    expect(data.length).toBe(0);
  });

  it('should handle input with only whitespace lines', async () => {
    const parser = new PrnParser();
    const { data, errors } = await collectStreamOutput(parser, '   \n \n   ');
    expect(errors.length).toBe(0);
    expect(data.length).toBe(0);
  });

  it('should emit an error if header line is present but completely unparsable (no EXPECTED_HEADERS found)', async () => {
    const badHeader =
      'ColumnA ColumnB ColumnC ColumnD ColumnE ColumnF\nData1 Data2 Data3 Data4 Data5 Data6';
    const parser = new PrnParser();
    const { data, errors } = await collectStreamOutput(parser, badHeader);

    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain(
      'PRN Error: Could not derive any column specifications from PRN header line.',
    );
    expect(data.length).toBe(0);
    for (const header of EXPECTED_HEADERS) {
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Expected header "${header}" not found in header line:`),
      );
    }
  });

  it('should process data arriving in multiple chunks', async () => {
    const prnLines = samplePrnData.split('\n');
    const chunks = [
      prnLines.slice(0, 3).join('\n') + '\n',
      prnLines.slice(3, 5).join('\n') + '\n',
      prnLines.slice(5).join('\n'),
    ];
    const parser = new PrnParser();
    const { data, errors } = await collectStreamOutput(parser, chunks);

    expect(errors.length).toBe(0);
    expect(data.length).toBe(7);
    expect(data[0][H_NAME]).toBe('Johnson, John');
    expect(data[6][H_NAME]).toBe('Smith, John');
  });

  it('should handle PRN data where a data line is shorter than header-defined columns', async () => {
    const shortLineData = `Name             Address               Postcode Phone        Credit Limit Birthday
Short Name         Short Address         SHORTPC`;
    const parser = new PrnParser();
    const { data, errors } = await collectStreamOutput(parser, shortLineData);

    expect(errors.length).toBe(0);
    expect(data.length).toBe(1);
    const record = data[0];

    expect(record[H_NAME]).toBe('Short Name');
    expect(record[H_ADDRESS]).toBe('Short Address');
    expect(record[H_POSTCODE]).toBe('SHORTPC');
    expect(record[H_PHONE]).toBe(normalizeFieldValue(H_PHONE, undefined));
    expect(record[H_CREDIT_LIMIT]).toBe(normalizeFieldValue(H_CREDIT_LIMIT, undefined));
    expect(record[H_BIRTHDAY]).toBe(normalizeFieldValue(H_BIRTHDAY, undefined));
  });

  it('should correctly pre-process Credit Limit even if it contains non-numeric characters in PRN (resulting in default)', async () => {
    const prnWithBadCredit = `Name             Address               Postcode Phone        Credit Limit Birthday
User1          Addr1                 PC1      123          NOTANUMBER   20000101`;
    const parser = new PrnParser();
    const { data, errors } = await collectStreamOutput(parser, prnWithBadCredit);

    expect(errors.length).toBe(0);
    expect(data.length).toBe(1);
    expect(data[0][H_CREDIT_LIMIT]).toBe('0.00');
  });

  it('should handle empty lines between data rows', async () => {
    const dataWithEmptyLines = `Name             Address               Postcode Phone        Credit Limit Birthday
Row1             Addr1                 PC1      123          10000        20000101

Row2             Addr2                 PC2      456          20000        20010101`;
    const parser = new PrnParser();
    const { data, errors } = await collectStreamOutput(parser, dataWithEmptyLines);

    expect(errors.length).toBe(0);
    expect(data.length).toBe(2);
    expect(data[0][H_NAME]).toBe('Row1');
    expect(data[1][H_NAME]).toBe('Row2');
  });
});
