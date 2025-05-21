import type { Transform } from 'node:stream';
import type { OutputType } from '../types.js'; // Your canonical InputType

export type RendererClass = new () => Transform;
export type RendererFactoryFunction = () => Transform;

// The registry can store either a class constructor or a factory function
export type RendererConstructor = RendererClass | RendererFactoryFunction;
export type RendererRegistry = Map<OutputType, RendererConstructor>;
