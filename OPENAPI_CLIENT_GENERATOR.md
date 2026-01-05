# OpenAPI Client Generator

The `wiz client` command generates fully typed TypeScript clients from OpenAPI specifications.

## Features

- ✅ **Model Generation**: Automatically generates TypeScript types from OpenAPI schemas
- ✅ **Typed API Methods**: Fully typed methods with path parameters, query parameters, and request bodies
- ✅ **Runtime Fetch**: Uses the global `fetch` API for maximum compatibility
- ✅ **Configuration**: Configurable base URL and global headers
- ✅ **Smart Naming**: Uses `operationId` or falls back to `methodPath` pattern
- ✅ **Duplicate Detection**: Throws errors on duplicate method names
- ✅ **Fetch Overrides**: Deep merge support for per-request fetch init options
- ✅ **Flexible Output**: Outputs to stdout or separate files

## Usage

### Generate to stdout

```bash
wiz client spec.yaml
```

### Generate to files

```bash
wiz client spec.yaml --outdir src/client
```

This creates:

- `model.ts` - TypeScript type definitions
- `api.ts` - Typed API client methods

## Example

Given an OpenAPI spec:

```yaml
openapi: 3.0.0
servers:
    - url: https://api.example.com/v1
paths:
    /users:
        get:
            operationId: listUsers
            parameters:
                - name: page
                  in: query
                  schema:
                      type: number
            responses:
                "200":
                    description: Success
        post:
            operationId: createUser
            requestBody:
                content:
                    application/json:
                        schema:
                            $ref: "#/components/schemas/CreateUserRequest"
            responses:
                "201":
                    description: Created
    /users/{userId}:
        get:
            operationId: getUserById
            parameters:
                - name: userId
                  in: path
                  required: true
                  schema:
                      type: string
            responses:
                "200":
                    description: Success
components:
    schemas:
        User:
            type: object
            properties:
                id:
                    type: string
                name:
                    type: string
            required:
                - id
                - name
        CreateUserRequest:
            type: object
            properties:
                name:
                    type: string
            required:
                - name
```

The generated client can be used like this:

```typescript
import { api, setApiConfig } from "./client/api";
import type { CreateUserRequest } from "./client/model";

// Configure the API client
setApiConfig({
    baseUrl: "https://api.example.com/v1",
    headers: {
        Authorization: "Bearer your-token-here",
    },
});

// List users with pagination
const response = await api.listUsers({
    page: 1,
});
const users = await response.json();

// Get a specific user
const userResponse = await api.getUserById({
    userId: "123",
});
const user = await userResponse.json();

// Create a new user
const newUser: CreateUserRequest = {
    name: "John Doe",
};
const createResponse = await api.createUser(newUser);

// Override fetch options for a single request
const customResponse = await api.getUserById(
    { userId: "123" },
    {
        headers: { "X-Custom-Header": "value" },
        cache: "no-cache",
    },
);
```

## Generated Code Structure

### model.ts

Contains all TypeScript type definitions from the OpenAPI schemas:

```typescript
export type User = {
    id: string;
    name: string;
};

export type CreateUserRequest = {
    name: string;
};
```

### api.ts

Contains the API client with configuration and methods:

```typescript
import type * as Models from "./model";

export interface ApiConfig {
  baseUrl?: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
}

export function setApiConfig(config: ApiConfig): void;
export function getApiConfig(): ApiConfig;

export const api = {
  async listUsers(queryParams?: ListUsersQueryParams, init?: RequestInit): Promise<Response>;
  async createUser(requestBody: CreateUserRequest, init?: RequestInit): Promise<Response>;
  async getUserById(pathParams: GetUserByIdPathParams, init?: RequestInit): Promise<Response>;
};
```

## Method Signatures

The generated methods follow these patterns:

### GET with query parameters

```typescript
async methodName(queryParams?: QueryParamsType, init?: RequestInit): Promise<Response>
```

### POST with request body

```typescript
async methodName(requestBody: BodyType, init?: RequestInit): Promise<Response>
```

### GET/PUT/DELETE with path parameters

```typescript
async methodName(pathParams: PathParamsType, init?: RequestInit): Promise<Response>
```

### POST/PUT with path parameters and body

```typescript
async methodName(pathParams: PathParamsType, requestBody: BodyType, init?: RequestInit): Promise<Response>
```

## Parameter Types

Parameter types are automatically generated for each method:

```typescript
type ListUsersQueryParams = {
    page?: number;
    limit?: number;
};

type GetUserByIdPathParams = {
    userId: string;
};
```

## Configuration

### Global Configuration

`setApiConfig` accepts a configuration object with the following options:

#### Static Configuration

```typescript
setApiConfig({
    baseUrl: "https://api.example.com/v1",
    headers: {
        Authorization: "Bearer token",
        "X-Custom-Header": "value",
    },
});
```

#### Custom Fetch Implementation

You can provide a custom `fetch` implementation to intercept and customize all API requests. This is useful for:

- Adding authentication tokens dynamically
- Implementing request/response logging
- Adding retry logic
- Using a custom HTTP client (e.g., undici, node-fetch)
- Mocking requests in tests

```typescript
// Example: Custom fetch with token refresh
let cachedToken: string | null = null;

const customFetch: typeof fetch = async (input, init) => {
    // Get fresh token if needed
    if (!cachedToken || isTokenExpired(cachedToken)) {
        cachedToken = await fetchNewToken();
    }

    // Add token to headers
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${cachedToken}`);

    // Make the request with updated headers
    return fetch(input, { ...init, headers });
};

setApiConfig({
    baseUrl: "https://api.example.com/v1",
    fetch: customFetch,
});
```

#### Request/Response Logging

```typescript
const loggingFetch: typeof fetch = async (input, init) => {
    console.log("Request:", input, init);
    const response = await fetch(input, init);
    console.log("Response:", response.status, response.statusText);
    return response;
};

setApiConfig({
    baseUrl: "https://api.example.com/v1",
    fetch: loggingFetch,
});
```

#### Using a Custom HTTP Client

```typescript
import { fetch as undiciFetch } from "undici";

setApiConfig({
    baseUrl: "https://api.example.com/v1",
    fetch: undiciFetch as typeof fetch,
});
```

#### Mocking in Tests

```typescript
import { expect, it, mock } from "bun:test";

it("should call API correctly", async () => {
    const mockFetch = mock(async () => {
        return new Response(JSON.stringify({ id: 1, name: "Test" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    });

    setApiConfig({
        baseUrl: "https://api.example.com",
        fetch: mockFetch,
    });

    const response = await api.getUserById({ userId: "1" });
    const data = await response.json();

    expect(data).toEqual({ id: 1, name: "Test" });
    expect(mockFetch).toHaveBeenCalledTimes(1);
});
```

### Default Base URL

The default base URL is taken from the `servers` entry in the OpenAPI spec. If not specified, it defaults to an empty string.

### Per-Request Overrides

The optional `init` parameter allows overriding fetch options for individual requests:

```typescript
await api.listUsers(
    { page: 1 },
    {
        headers: { "X-Request-ID": "123" },
        cache: "no-cache",
        signal: abortController.signal,
    },
);
```

The headers are deeply merged with global headers and defaults.

## Method Naming

1. **operationId**: If present in the OpenAPI spec, it's used as the method name
2. **Fallback**: If no operationId, generates name from HTTP method + path (e.g., `getUserById` for `GET /users/{id}`)

## Error Handling

The generator throws an error if duplicate method names are detected:

```
Error: Duplicate method names detected: getUsers. Please specify unique operationIds in your OpenAPI spec.
```

## Requirements

- OpenAPI 3.0 or 3.1 specification
- Valid JSON or YAML format
- Unique method names (operationId or generated)

## Supported Features

### Parameters

- ✅ Path parameters
- ✅ Query parameters
- ✅ Required and optional parameters
- ✅ All primitive types (string, number, boolean)

### Request Bodies

- ✅ JSON content type
- ✅ Schema references ($ref)
- ✅ Inline schemas

### HTTP Methods

- ✅ GET, POST, PUT, PATCH, DELETE
- ✅ HEAD, OPTIONS, TRACE

### Configuration

- ✅ Base URL from servers
- ✅ Global headers
- ✅ Per-request overrides

## Limitations

- Only `application/json` content type is currently supported
- Response types are not generated (returns `Promise<Response>`)
- No validation of request/response data
- No automatic retry or error handling

## Testing

The implementation includes comprehensive test coverage:

- 13 unit tests for the generator
- 6 integration tests for the CLI
- All 286 existing tests passing
- No security vulnerabilities detected
