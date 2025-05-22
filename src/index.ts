#!/usr/bin/env bun
import type { Readable, Writable } from 'node:stream'; // pipeline will be mocked from promises
import { pipeline as streamPipeline } from 'node:stream/promises';
import { Command, InvalidArgumentError } from 'commander';
import { createParser } from './parsers/index.js';
import { createRenderer } from './renderers/index.js';
import type { InputType, OutputType, ConversionOptions } from './types.js';
import { ALLOWED_INPUT_TYPES, ALLOWED_OUTPUT_TYPES } from './types.js';

// --- Debug Logger Utility ---
const IS_DEBUG_MODE = Boolean(
  process.env.DEBUG && process.env.DEBUG !== 'false' && process.env.DEBUG !== '0',
);

function debugLog(...args: any[]): void {
  if (IS_DEBUG_MODE) {
    console.error('DEBUG:', ...args);
  }
}
// --- End Debug Logger Utility ---

export function validateInputType(value: string): InputType {
  const lowerValue = value.toLowerCase();
  if (ALLOWED_INPUT_TYPES.includes(lowerValue as any)) {
    return lowerValue as InputType;
  }
  throw new InvalidArgumentError(
    `Input type must be one of: ${ALLOWED_INPUT_TYPES.join(', ')}.`,
  );
}

export function validateOutputType(value: string): OutputType {
  const lowerValue = value.toLowerCase();
  if (ALLOWED_OUTPUT_TYPES.includes(lowerValue as any)) {
    return lowerValue as OutputType;
  }
  throw new InvalidArgumentError(
    `Output type must be one of: ${ALLOWED_OUTPUT_TYPES.join(', ')}.`,
  );
}

export async function runConversion(
  inputType: InputType,
  outputType: OutputType,
  processingOptions: ConversionOptions = {},
  inputStream: Readable = process.stdin as Readable,
  outputStream: Writable = process.stdout as Writable,
  pipelineFn: typeof streamPipeline = streamPipeline,
) {
  debugLog('runConversion started.');
  const sourceStream: Readable = inputStream;
  const destinationStream: Writable = outputStream;

  debugLog("Before sourceStream.setEncoding('utf8')");
  try {
    sourceStream.setEncoding('latin1');
    debugLog("After sourceStream.setEncoding('utf8') - SUCCESSFUL");
  } catch (e: any) {
    debugLog('ERROR during sourceStream.setEncoding:', e.message, e.stack);
    throw e;
  }

  try {
    debugLog('Before createParser. InputType:', inputType, 'Options:', processingOptions);
    const parser = createParser(inputType, processingOptions);
    debugLog('After createParser. Parser instance:', parser ? 'created' : 'null');

    if (inputType === 'csv' && processingOptions.csvDelimiter) {
      debugLog(
        // Changed from console.error to debugLog
        `Using custom CSV delimiter: "${processingOptions.csvDelimiter}"`,
      );
    }

    debugLog('Before createRenderer. OutputType:', outputType);
    const renderer = createRenderer(outputType /*, processingOptions */);
    debugLog('After createRenderer. Renderer instance:', renderer ? 'created' : 'null');

    console.error(`Processing ${inputType} to ${outputType}...`); // Keep general progress on stderr

    debugLog('Before pipelineFn call.');
    await pipelineFn(sourceStream, parser, renderer, destinationStream);
    debugLog('After pipelineFn call - SUCCESSFUL.');

    console.error('Processing complete.'); // Keep general progress on stderr
  } catch (error: any) {
    debugLog("ERROR in runConversion's main try block:", error.message);
    if (IS_DEBUG_MODE && error.stack) {
      // Also make stack trace conditional for this debug log
      debugLog('Error stack:', error.stack);
    }
    // Your existing error logging for users
    console.error('\nAn error occurred during processing:');
    console.error(error.message);
    // Stack trace for users if DEBUG is set (or in development)
    if (IS_DEBUG_MODE || process.env.NODE_ENV === 'development') {
      if (error.stack) {
        console.error(error.stack);
      }
    }
    throw error;
  }
}

export async function mainCli(argv?: readonly string[]) {
  debugLog('mainCli started.');
  const program = new Command();

  program
    .version('1.0.0')
    .description(
      'A command line utility to transform CSV or PRN data from stdin to JSON or HTML on stdout.',
    )
    .argument('<inputType>', 'Input data format (csv or prn)', validateInputType)
    .argument('<outputType>', 'Output data format (json or html)', validateOutputType)
    .option(
      '-d, --csv-delimiter <char>',
      'Delimiter character for CSV input (e.g., ";", "\\t"). Default is ",".',
    )
    .action(async (inputTypeFromArgs, outputTypeFromArgs, cmdOptions) => {
      debugLog('Commander action started.');
      try {
        const processingOptions: ConversionOptions = {
          csvDelimiter: cmdOptions.csvDelimiter,
        };
        debugLog(
          'Calling runConversion with:',
          inputTypeFromArgs,
          outputTypeFromArgs,
          processingOptions,
        );
        await runConversion(inputTypeFromArgs, outputTypeFromArgs, processingOptions);
        debugLog('runConversion completed successfully in action.');
      } catch (e: any) {
        debugLog('Error caught in Commander action, exiting. Error message:', e.message);
        process.exit(1);
      }
    });

  debugLog('Before program.parseAsync.');
  try {
    await program.parseAsync(argv || process.argv);
    debugLog('After program.parseAsync - SUCCESSFUL.');
  } catch (parseError: any) {
    debugLog('ERROR during program.parseAsync:', parseError.message, parseError.stack);
    process.exit(1);
  }
}

if (import.meta.main) {
  debugLog('Script is main, calling mainCli.');
  mainCli().catch((e) => {
    debugLog('Unhandled error in mainCli promise chain:', e.message, e.stack);
    process.exit(1);
  });
}
