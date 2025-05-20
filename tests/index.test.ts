import { describe, it, expect, beforeEach, afterEach, mock, spyOn, jest } from 'bun:test';
import { InvalidArgumentError } from 'commander';
import { Readable, Writable, Transform } from 'node:stream';
import { ALLOWED_INPUT_TYPES, ALLOWED_OUTPUT_TYPES } from '../src/types.js';

import { validateInputType, validateOutputType, runConversion } from '../src/index.js';

// Mock internal dependencies
mock.module('../src/parsers/index.js', () => ({
  createParser: mock(),
}));
mock.module('../src/renderers/index.js', () => ({
  createRenderer: mock(),
}));

import { createParser as mockedCreateParser } from '../src/parsers/index.js';
import { createRenderer as mockedCreateRenderer } from '../src/renderers/index.js';

const expectedInputTypesErrMsg = `Input type must be one of: ${ALLOWED_INPUT_TYPES.join(', ')}.`;
const expectedOutputTypesErrMsg = `Output type must be one of: ${ALLOWED_OUTPUT_TYPES.join(', ')}.`;

describe('CLI Unit Tests - src/index.ts', () => {
  describe('Argument Validators', () => {
    describe('validateInputType', () => {
      it("should return 'csv' for valid csv inputs", () => {
        expect(validateInputType('csv')).toBe('csv');
        expect(validateInputType('CSV')).toBe('csv');
      });

      it("should return 'prn' for valid prn inputs", () => {
        expect(validateInputType('prn')).toBe('prn');
        expect(validateInputType('PRN')).toBe('prn');
      });

      it('should throw InvalidArgumentError for invalid input types', () => {
        expect(() => validateInputType('xml')).toThrow(
          new InvalidArgumentError(expectedInputTypesErrMsg),
        );
        expect(() => validateInputType('')).toThrow(
          new InvalidArgumentError(expectedInputTypesErrMsg),
        );
      });
    });

    describe('validateOutputType', () => {
      it("should return 'json' for valid json inputs", () => {
        expect(validateOutputType('json')).toBe('json');
        expect(validateOutputType('JSON')).toBe('json');
      });

      it("should return 'html' for valid html inputs", () => {
        expect(validateOutputType('html')).toBe('html');
        expect(validateOutputType('HTML')).toBe('html');
      });

      it('should throw InvalidArgumentError for invalid output types', () => {
        expect(() => validateOutputType('xml')).toThrow(
          new InvalidArgumentError(expectedOutputTypesErrMsg),
        );
        expect(() => validateOutputType('')).toThrow(
          new InvalidArgumentError(expectedOutputTypesErrMsg),
        );
      });
    });
  });

  describe('runConversion - Core Logic Orchestration', () => {
    let mockInputStream: Readable & { setEncoding: ReturnType<typeof mock> };
    let mockOutputStream: Writable;
    let mockParserInstance: Transform;
    let mockRendererInstance: Transform;
    let mockPipelineFn: ReturnType<typeof mock>;
    let originalConsoleError: typeof console.error;

    beforeEach(() => {
      jest.clearAllMocks();

      mockInputStream = new Readable({ read() {} }) as Readable & {
        setEncoding: ReturnType<typeof mock>;
      };
      mockInputStream.setEncoding = mock();

      mockOutputStream = new Writable({
        write(chunk, enc, cb) {
          cb();
        },
      });

      mockParserInstance = new Transform({
        objectMode: true,
        transform(chunk, enc, cb) {
          cb(null, chunk);
        },
      });

      mockRendererInstance = new Transform({
        writableObjectMode: true,
        readableObjectMode: false,
        transform(chunk, enc, cb) {
          cb(null, String(chunk));
        },
      });

      mockedCreateParser.mockReturnValue(mockParserInstance);
      mockedCreateRenderer.mockReturnValue(mockRendererInstance);

      mockPipelineFn = mock().mockResolvedValue(undefined);

      originalConsoleError = console.error;
      console.error = mock();
    });

    afterEach(() => {
      console.error = originalConsoleError;
    });

    it('should correctly setup and run pipeline for CSV to JSON', async () => {
      await runConversion(
        'csv',
        'json',
        {},
        mockInputStream,
        mockOutputStream,
        mockPipelineFn,
      );

      expect(mockInputStream.setEncoding).toHaveBeenCalledWith('utf8');
      expect(mockedCreateParser).toHaveBeenCalledWith('csv', {});
      expect(mockedCreateRenderer).toHaveBeenCalledWith('json');
      expect(mockPipelineFn).toHaveBeenCalledWith(
        mockInputStream,
        mockParserInstance,
        mockRendererInstance,
        mockOutputStream,
      );
      expect(console.error).toHaveBeenCalledWith('Processing csv to json...');
      expect(console.error).toHaveBeenCalledWith('Processing complete.');
    });

    it('should correctly setup and run pipeline for PRN to HTML', async () => {
      await runConversion(
        'prn',
        'html',
        {},
        mockInputStream,
        mockOutputStream,
        mockPipelineFn,
      );

      expect(mockInputStream.setEncoding).toHaveBeenCalledWith('utf8');
      expect(mockedCreateParser).toHaveBeenCalledWith('prn', {});
      expect(mockedCreateRenderer).toHaveBeenCalledWith('html');
      expect(mockPipelineFn).toHaveBeenCalledWith(
        mockInputStream,
        mockParserInstance,
        mockRendererInstance,
        mockOutputStream,
      );
      expect(console.error).toHaveBeenCalledWith('Processing prn to html...');
      expect(console.error).toHaveBeenCalledWith('Processing complete.');
    });

    it('should log error and re-throw if pipelineFn fails', async () => {
      const error = new Error('Stream pipeline failed!');
      mockPipelineFn.mockRejectedValueOnce(error);

      await expect(
        runConversion(
          'csv',
          'json',
          {},
          mockInputStream,
          mockOutputStream,
          mockPipelineFn,
        ),
      ).rejects.toThrow(error);

      expect(console.error).toHaveBeenCalledWith(
        '\nAn error occurred during processing:',
      );
      expect(console.error).toHaveBeenCalledWith(error.message);
    });

    it('should log error with stack trace in development mode if pipeline fails', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Pipeline failed!');
      error.stack = 'stack trace here';
      mockPipelineFn.mockRejectedValueOnce(error);

      await expect(
        runConversion(
          'csv',
          'json',
          {},
          mockInputStream,
          mockOutputStream,
          mockPipelineFn,
        ),
      ).rejects.toThrow(error);

      expect(console.error).toHaveBeenCalledWith(
        '\nAn error occurred during processing:',
      );
      expect(console.error).toHaveBeenCalledWith(error.message);
      expect(console.error).toHaveBeenCalledWith(error.stack);

      process.env.NODE_ENV = originalEnv;
    });
  });
});
