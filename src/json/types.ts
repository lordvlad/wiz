/**
 * Serializer function that converts a value of type T to a JSON string
 */
export type JsonSerializer<T> = {
    (value: T): string;
    (value: T, buf: Buffer): void;
};

/**
 * Parser function that converts a JSON string or Buffer to a value of type T
 */
export type JsonParser<T> = {
    (src: string): T;
    (src: Buffer): T;
};
