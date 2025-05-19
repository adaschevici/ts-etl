#!/usr/bin/env bun
import type { Readable, Writable } from 'node:stream'; // pipeline will be mocked from promises
import { pipeline as streamPipeline } from 'node:stream/promises';
import { Command, InvalidArgumentError } from 'commander';
import { createParser } from './parsers/index.js';
import { createRenderer } from './renderers/index.js';
import type { InputType, OutputType } from './types.ts';
import { ALLOWED_INPUT_TYPES, ALLOWED_OUTPUT_TYPES } from './types.ts';

export function validateInputType(value: string): InputType {
  const lowerValue = value.toLowerCase();
  if (ALLOWED_INPUT_TYPES.includes(lowerValue as any)) {
    // Type assertion needed here
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

// Exported for testing: Core logic of the application
export async function runConversion(
  inputType: InputType,
  outputType: OutputType,
  // Allow injecting streams for easier testing & flexibility
  inputStream: Readable = Bun.stdin as any,
  outputStream: Writable = Bun.stdout as any,
  // Allow injecting the pipeline function for testing
  pipelineFn: typeof streamPipeline = streamPipeline,
) {
  const sourceStream: Readable = inputStream;
  const destinationStream: Writable = outputStream;

  sourceStream.setEncoding('utf8');

  try {
    const parser = createParser(inputType); // Assumes createParser is not async
    const formatter = createRenderer(outputType); // Assumes createFormatter is not async

    console.error(`Processing ${inputType} to ${outputType}...`); // To stderr

    await pipelineFn(sourceStream, parser, formatter, destinationStream);

    console.error('Processing complete.'); // To stderr
  } catch (error: any) {
    console.error('\nAn error occurred during processing:');
    console.error(error.message);
    if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
      if (error.stack) {
        console.error(error.stack);
      }
    }
    throw error; // Re-throw to allow main CLI handler to set exit code
  }
}

// Main CLI execution function
async function mainCli() {
  const program = new Command();

  program
    .version('1.0.0')
    .description(
      'A command line utility to transform CSV or PRN data from stdin to JSON or HTML on stdout.',
    )
    .argument('<inputType>', 'Input data format (csv or prn)', validateInputType)
    .argument('<outputType>', 'Output data format (json or html)', validateOutputType)
    .action(async (inputTypeFromArgs, outputTypeFromArgs) => {
      try {
        await runConversion(inputTypeFromArgs, outputTypeFromArgs);
      } catch (e) {
        // Error details should have been logged by runConversion
        process.exit(1); // Ensure non-zero exit code if runConversion throws
      }
    });

  await program.parseAsync(process.argv);
}

// Guard to ensure mainCli() is called only when the script is executed directly,
// not when imported as a module (e.g., by test files).
if (import.meta.main) {
  mainCli().catch(() => {
    // Catch unhandled promise rejections from mainCli if any (e.g. from parseAsync itself)
    // Commander usually handles its own exit on parse errors.
    process.exit(1);
  });
}
