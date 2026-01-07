import { pluginNotEnabled } from "../errors";
import type { ProtobufModel, ProtobufSpec, RpcCallMetadata, ProtobufSerializer, ProtobufParser } from "./types";

// Accepts a tuple of types to generate protobuf message definitions
export function createProtobufModel<T extends readonly any[]>(): ProtobufModel {
    // intentionally empty, will be replaced at build time
    throw pluginNotEnabled();
}

// Configuration for protobuf spec
export type ProtobufConfig = {
    package?: string;
    serviceName?: string;
};

// Accepts a tuple of types and optional config to generate protobuf specification with services
export function createProtobufSpec<T extends readonly any[]>(config?: ProtobufConfig): ProtobufSpec {
    // intentionally empty, will be replaced at build time
    throw pluginNotEnabled();
}

// RPC call function for collecting service methods (analogous to openApiPath)
export function rpcCall<
    RequestType = never,
    ResponseType = any,
    Handler extends (...args: any[]) => any = (...args: any[]) => any,
>(handler: Handler): Handler {
    return handler;
}

/**
 * Serializes a value to protobuf binary format with optimized encoding
 * @param value The value to serialize
 * @returns Uint8Array representation of the value
 */
export function protobufSerialize<T>(value: T): Uint8Array;
/**
 * Serializes a value directly to a Buffer with optimized writing
 * @param value The value to serialize
 * @param buf The buffer to write to
 */
export function protobufSerialize<T>(value: T, buf: Buffer): void;
export function protobufSerialize<T>(value: T, buf?: Buffer): Uint8Array | void {
    // intentionally empty, will be replaced at build time
    throw pluginNotEnabled();
}

/**
 * Creates a reusable protobuf serializer function for type T
 * @returns A serializer function with both Uint8Array and buffer overloads
 */
export function createProtobufSerializer<T>(): ProtobufSerializer<T> {
    // intentionally empty, will be replaced at build time
    throw pluginNotEnabled();
}

/**
 * Parses protobuf binary data and validates it against type T
 * @param src The protobuf binary data or Buffer to parse
 * @returns The parsed and validated value of type T
 */
export function protobufParse<T>(src: Uint8Array): T;
/**
 * Parses protobuf binary data from Buffer and validates it against type T
 * @param src The protobuf binary data or Buffer to parse
 * @returns The parsed and validated value of type T
 */
export function protobufParse<T>(src: Buffer): T;
export function protobufParse<T>(src: Uint8Array | Buffer): T {
    // intentionally empty, will be replaced at build time
    throw pluginNotEnabled();
}

/**
 * Creates a reusable protobuf parser function for type T
 * @returns A parser function with both Uint8Array and buffer overloads
 */
export function createProtobufParser<T>(): ProtobufParser<T> {
    // intentionally empty, will be replaced at build time
    throw pluginNotEnabled();
}

export type { ProtobufSerializer, ProtobufParser };
