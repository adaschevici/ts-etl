import { describe, it, expect } from 'bun:test';
import { Readable } from 'node:stream';
import { CsvParser } from '../../src/parsers/csvParser.js'; // Adjust path if necessary
import type { ParsedRow, ConversionOptions } from '../../src/types.js'; // Adjust path
// Import the ACTUAL normalization utilities. We are testing their integration with CsvParser.
import { EXPECTED_HEADERS, normalizeFieldValue } from '../../src/utils/normalization.js'; // Adjust path

// Helper function to stream data into CsvParser and collect the output
async function collectStreamOutput(
  parser: CsvParser,
  csvInput: string[] | string,
): Promise<{ data: ParsedRow[]; errors: Error[] }> {
  const data: ParsedRow[] = [];
  const errors: Error[] = [];

  return new Promise((resolve) => {
    parser.on('data', (row: ParsedRow) => data.push(row));
    parser.on('error', (err: Error) => errors.push(err));
    parser.on('end', () => resolve({ data, errors }));

    if (Array.isArray(csvInput)) {
      for (const chunk of csvInput) {
        parser.write(chunk);
      }
    } else {
      parser.write(csvInput);
    }
    parser.end();
  });
}

const sampleCsvData = `Name,Address,Postcode,Phone,Credit Limit,Birthday
"Johnson, John",Voorstraat 32,3122gg,020 3849381,10000,01/01/1987
"Anderson, Paul",Dorpsplein 3A,4532 AA,030 3458986,109093,03/12/1965
"Wicket, Steve",Mendelssohnstraat 54d,3423 ba,0313-398475,934,03/06/1964
"Benetar, Pat",Driehoog 3zwart,2340 CC,06-28938945,54,04/09/1964
"Gibson, Mal",Vredenburg 21,3209 DD,06-48958986,54.5,09/11/1978
"Friendly, User",Sint Jansstraat 32,4220 EE,0885-291029,63.6,10/08/1980
"Smith, John",Børkestraße 32,87823,+44 728 889838,9898.3,20/09/1999`;

describe('CsvParser with Sample Data and Real Normalization', () => {
  // Since we are using the actual normalization logic, we don't mock it here.
  // Ensure that `src/utils/normalization.js` and `src/types.ts` are correctly implemented.

  it('should parse the full sample CSV data correctly with default delimiter', async () => {
    const parser = new CsvParser(); // Default options (delimiter ',')
    const { data, errors } = await collectStreamOutput(parser, sampleCsvData);

    expect(errors.length).toBe(0);
    expect(data.length).toBe(7);

    // Check a few records based on the assumed normalization rules
    expect(data[0]).toEqual({
      Name: 'Johnson, John',
      Address: 'Voorstraat 32',
      Postcode: '3122GG',
      Phone: '0203849381',
      'Credit Limit': '10000.00',
      Birthday: '1987-01-01',
    });

    expect(data[1]).toEqual({
      Name: 'Anderson, Paul',
      Address: 'Dorpsplein 3A',
      Postcode: '4532AA',
      Phone: '0303458986',
      'Credit Limit': '109093.00',
      Birthday: '1965-12-03',
    });

    expect(data[4]).toEqual({
      // "Gibson, Mal"
      Name: 'Gibson, Mal',
      Address: 'Vredenburg 21',
      Postcode: '3209DD',
      Phone: '0648958986',
      'Credit Limit': '54.50',
      Birthday: '1978-11-09',
    });

    expect(data[6]).toEqual({
      // "Smith, John"
      Name: 'Smith, John',
      Address: 'Børkestraße 32',
      Postcode: '87823', // Assuming no space, already uppercase or single part
      Phone: '+44728889838',
      'Credit Limit': '9898.30',
      Birthday: '1999-09-20',
    });
  });

  it('should parse CSV with a custom delimiter ";" correctly', async () => {
    // To test custom delimiter, we need to modify the input string.
    // This regex replaces commas with semicolons, only if not inside quotes.
    const csvDataSemicolon = sampleCsvData.replace(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/g, ';');

    const options: ConversionOptions = { csvDelimiter: ';' };
    const parser = new CsvParser(options);
    const { data, errors } = await collectStreamOutput(parser, csvDataSemicolon);

    expect(errors.length).toBe(0);
    expect(data.length).toBe(7);
    // Check if "Johnson, John" (which contains a comma) was parsed as a single field
    expect(data[0].Name).toBe('Johnson, John');
    expect(data[0].Address).toBe('Voorstraat 32');
    expect(data[0].Postcode).toBe('3122GG'); // Normalization should still apply
  });

  it('should map CSV headers with different casing to EXPECTED_HEADERS keys', async () => {
    const csvInput =
      'name,ADDRESS,postcode,pHone,Credit limit,BIRTHDAY\n' + // Varied casing
      '"Test User","Test Address",testpc,12345,100.00,01/01/2000';
    const parser = new CsvParser();
    const { data, errors } = await collectStreamOutput(parser, csvInput);

    expect(errors.length).toBe(0);
    expect(data.length).toBe(1);
    const record = data[0];
    // Check that all keys match EXPECTED_HEADERS' casing
    for (const header of EXPECTED_HEADERS) {
      expect(record).toHaveProperty(header);
    }
    expect(record.Name).toBe('Test User');
    expect(record.Address).toBe('Test Address');
    expect(record.Postcode).toBe('TESTPC'); // Assuming normalization does uppercase
    expect(record.Phone).toBe('12345');
    expect(record['Credit Limit']).toBe('100.00');
    expect(record.Birthday).toBe('2000-01-01');
  });

  it('should provide default normalized values for EXPECTED_HEADERS not in CSV data', async () => {
    // CSV data missing 'Address' and 'Phone' columns
    const csvInput =
      'Name,Postcode,Credit Limit,Birthday\n' +
      '"Partial User","PC123",500.00,02/02/2002';
    const parser = new CsvParser();
    const { data, errors } = await collectStreamOutput(parser, csvInput);

    expect(errors.length).toBe(0);
    expect(data.length).toBe(1);
    const record = data[0];

    expect(record.Name).toBe('Partial User');
    expect(record.Postcode).toBe('PC123'); // Assuming normalization
    expect(record['Credit Limit']).toBe('500.00');
    expect(record.Birthday).toBe('2002-02-02');

    // Check for default values for missing EXPECTED_HEADERS
    // These rely on normalizeFieldValue(header, undefined) behavior
    expect(record.Address).toBe(normalizeFieldValue('Address', undefined));
    expect(record.Phone).toBe(normalizeFieldValue('Phone', undefined));
  });

  it('should ignore extra columns in CSV not in EXPECTED_HEADERS', async () => {
    const csvInput =
      'Name,Address,ExtraInfoCol,Hobby,Birthday\n' + // ExtraInfoCol and Hobby are extra
      '"User With Extras","Main Street","Some Info","Reading","03/03/2003"';
    const parser = new CsvParser();
    const { data, errors } = await collectStreamOutput(parser, csvInput);

    expect(errors.length).toBe(0);
    expect(data.length).toBe(1);
    const record = data[0];

    expect(record.Name).toBe('User With Extras');
    expect(record.Address).toBe('Main Street');
    expect(record.Birthday).toBe('2003-03-03');

    // Ensure extra columns are not present
    expect(record).not.toHaveProperty('ExtraInfoCol');
    expect(record).not.toHaveProperty('Hobby');

    // Ensure all EXPECTED_HEADERS are present (some with default values)
    for (const header of EXPECTED_HEADERS) {
      expect(record).toHaveProperty(header);
    }
    expect(record.Postcode).toBe(normalizeFieldValue('Postcode', undefined)); // Example of a default
  });

  it('should handle empty input correctly', async () => {
    const parser = new CsvParser();
    const { data, errors } = await collectStreamOutput(parser, '');
    expect(errors.length).toBe(0);
    expect(data.length).toBe(0);
  });

  it('should handle input with only headers correctly', async () => {
    const parser = new CsvParser();
    const { data, errors } = await collectStreamOutput(parser, 'Name,Address,Birthday\n');
    expect(errors.length).toBe(0);
    expect(data.length).toBe(0);
  });

  it('should emit an error for malformed CSV (e.g., unclosed quote)', async () => {
    const csvInput = 'Name,Address\n"John Doe,"Unclosed Address field';
    const parser = new CsvParser();
    const { data, errors } = await collectStreamOutput(parser, csvInput);

    // csv-parse might still produce some data before erroring, or none.
    // The key is that an error is emitted.
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('CSV parsing error:');
    // Example underlying error: "Invalid Closing Quote: got EOL instead of quote"
  });

  it('should process data arriving in multiple chunks', async () => {
    const csvLines = sampleCsvData.split('\n');
    const chunks = [
      csvLines.slice(0, 3).join('\n') + '\n', // Header + 2 data lines
      csvLines.slice(3, 5).join('\n') + '\n', // Next 2 data lines
      csvLines.slice(5).join('\n'), // Remaining data lines
    ];
    const parser = new CsvParser();
    const { data, errors } = await collectStreamOutput(parser, chunks);

    expect(errors.length).toBe(0);
    expect(data.length).toBe(7); // All data rows should be parsed
    expect(data[0].Name).toBe('Johnson, John');
    expect(data[6].Name).toBe('Smith, John');
  });
});
