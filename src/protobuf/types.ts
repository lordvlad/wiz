// Protobuf message definition
export type ProtobufMessage = {
    name: string;
    fields: ProtobufField[];
};

// Protobuf field definition
export type ProtobufField = {
    name: string;
    type: string;
    number: number;
    repeated?: boolean;
    optional?: boolean;
    map?: {
        keyType: string;
        valueType: string;
    };
};

// Protobuf enum definition
export type ProtobufEnum = {
    name: string;
    values: Array<{ name: string; number: number }>;
};

// Protobuf service definition
export type ProtobufService = {
    name: string;
    methods: ProtobufMethod[];
};

// Protobuf RPC method definition
export type ProtobufMethod = {
    name: string;
    requestType: string;
    responseType: string;
    requestStreaming?: boolean;
    responseStreaming?: boolean;
};

// Protobuf model (messages only)
export type ProtobufModel = {
    syntax: "proto3";
    package: string;
    messages: Record<string, ProtobufMessage>;
    enums?: Record<string, ProtobufEnum>;
};

// Full protobuf specification with services
export type ProtobufSpec = ProtobufModel & {
    services?: Record<string, ProtobufService>;
};

// RPC call metadata for collecting service methods
export type RpcCallMetadata<
    RequestType = any,
    ResponseType = any,
    Handler extends (...args: any[]) => any = (...args: any[]) => any,
> = {
    requestType?: RequestType;
    responseType?: ResponseType;
    handler?: Handler;
};
