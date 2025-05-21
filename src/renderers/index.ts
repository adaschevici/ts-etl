import { Transform } from 'node:stream';
import type { OutputType, ConversionOptions } from '../types.js'; // Adjust path as necessary
import { HtmlRenderer } from './htmlRenderer.js'; // Adjust path to your HtmlRenderer
import type {
  RendererRegistry,
  RendererConstructor,
  RendererClass,
  RendererFactoryFunction,
} from './renderer.types.js'; // Adjust path as necessary

const rendererRegistry: RendererRegistry = new Map();

export function registerRenderer(
  type: OutputType,
  constructor: RendererConstructor,
): void {
  if (rendererRegistry.has(type)) {
    // In a real application, you might throw an error or log a more severe warning.
    // For this example, we'll allow overwriting with a warning.
    console.warn(`Renderer type "${type}" is already registered. Overwriting.`);
  }
  rendererRegistry.set(type, constructor);
}

export function createRenderer(outputType: OutputType): Transform {
  const RendererConstructor = rendererRegistry.get(outputType);

  if (!RendererConstructor) {
    // This error should ideally be caught earlier by CLI argument validation
    // (e.g., if ALLOWED_OUTPUT_TYPES is derived from registered renderers).
    throw new Error(`Unsupported output type: "${outputType}". No renderer registered.`);
  }

  if (typeof RendererConstructor === 'function') {
    try {
      // @ts-ignore - We assume it's a constructor if it's not explicitly a factory function
      if (
        RendererConstructor.prototype &&
        RendererConstructor.prototype.constructor === RendererConstructor
      ) {
        return new (RendererConstructor as RendererClass)();
      }
      // If it's not a class (e.g. a simple factory function)
      return (RendererConstructor as RendererFactoryFunction)();
    } catch (e: any) {
      console.error(
        `Error instantiating or calling renderer for type "${outputType}": ${e.message}`,
      );
      throw new Error(`Failed to create renderer for type "${outputType}".`);
    }
  }
  // This part should ideally not be reached if the entry is always a function (class or factory fn)
  throw new Error(`Invalid renderer registry entry for type "${outputType}".`);
}

registerRenderer('html', HtmlRenderer);
