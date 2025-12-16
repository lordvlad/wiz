export type ValidationError = {
    path: string;
    error: string;
    expected: { type: string; [key: string]: any };
    actual: { type: string; value: any };
};

export type Validator<T> = (value: unknown) => ValidationError[];

export type Asserter<T> = (value: unknown) => asserts value is T;

export type TypeGuard<T> = (value: unknown) => value is T;
