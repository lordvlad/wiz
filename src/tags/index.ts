export type BigIntFormatType = "string" | "int64";
export type NumFormatType = "string" | "int64" | "int32" | "float" | "double";
export type StrFormatType =
    | "binary"
    | "byte"
    | "date"
    | "date-time"
    | "password"
    | "email"
    | "uuid"
    | "uri"
    | "uri-reference"
    | "uri-template"
    | "hostname"
    | "ipv4"
    | "ipv6"
    | "regex"
    | "json-pointer"
    | "relative-json-pointer";
export type DateFormatType = "date" | "date-time" | "unix-s" | "unix-ms";

export type StrFormat<T extends StrFormatType> = string & { __str_format: T };
export type BigIntFormat<T extends BigIntFormatType> = bigint & { __bigint_format: T };
export type NumFormat<T extends NumFormatType> = number & { __num_format: T };
export type DateFormat<T extends DateFormatType> = Date & { __date_format: T };
