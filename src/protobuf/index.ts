import { pluginNotEnabled } from "../errors";
import type { ProtobufModel, ProtobufSpec, RpcCallMetadata } from "./types";

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
