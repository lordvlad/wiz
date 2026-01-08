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
- ✅ **Runtime Validation**: Optional wiz validator integration for request and response validation
- ✅ **React Query Integration**: Context-based configuration with query/mutation options and custom hooks

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

### Generate with validation

```bash
wiz client spec.yaml --outdir src/client --wiz-validator
```

Enables runtime validation using wiz validators for:

- Path parameters
- Query parameters
- Request bodies
- Response bodies

Validation errors throw `TypeError` with detailed error messages.

### Generate with React Query integration

```bash
wiz client spec.yaml --outdir src/client --react-query
```

Enables React Query integration which includes:

- **ApiContext**: React context for providing API configuration
- **Query Options Methods**: Helper functions that return options for `useQuery` (GET/HEAD/OPTIONS operations)
- **Mutation Options Methods**: Helper functions that return options for `useMutation` (POST/PUT/PATCH/DELETE operations)
- **Custom Hooks**: Ready-to-use hooks for each endpoint (requires `@tanstack/react-query`)

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

## Runtime Validation

The `--wiz-validator` option enables automatic runtime validation for API requests and responses. This feature integrates with wiz's compile-time validator generation to provide zero-runtime-overhead validation.

### Usage

```bash
wiz client spec.yaml --outdir src/client --wiz-validator
```

### What Gets Validated

When enabled, the generated client validates:

1. **Path Parameters**: Validated before building the URL
2. **Query Parameters**: Validated before adding to the request
3. **Request Bodies**: Validated before serialization to JSON
4. **Response Bodies**: Validated after receiving a successful response (200-204 status codes)

### Validation Behavior

- **Validation Errors**: Throw `TypeError` with detailed error messages including the validation errors array
- **Response Validation**: Uses cloned response to preserve the original response body stream
- **Non-JSON Responses**: Gracefully skips validation for responses that aren't JSON
- **Error Handling**: Validation happens before the request for inputs, and after for responses

### Example

Given a spec with a User model:

```yaml
components:
    schemas:
        User:
            type: object
            properties:
                id:
                    type: string
                name:
                    type: string
                    minLength: 3
            required:
                - id
                - name
```

The generated client will:

```typescript
// Validate path parameters
const pathParamsErrors = validateGetUserByIdPathParams(pathParams);
if (pathParamsErrors.length > 0) {
    throw new TypeError("Invalid path parameters: " + JSON.stringify(pathParamsErrors));
}

// Validate request body
const requestBodyErrors = validateUser(requestBody);
if (requestBodyErrors.length > 0) {
    throw new TypeError("Invalid request body: " + JSON.stringify(requestBodyErrors));
}

// Validate response body
const response = await fetchImpl(fullUrl, options);
if (response.ok) {
    const clonedResponse = response.clone();
    try {
        const responseBody = await clonedResponse.json();
        const responseBodyErrors = validateUser(responseBody);
        if (responseBodyErrors.length > 0) {
            throw new TypeError("Invalid response body: " + JSON.stringify(responseBodyErrors));
        }
    } catch (error) {
        if (error instanceof SyntaxError) {
            // Not JSON, skip validation
        } else {
            throw error;
        }
    }
}
return response;
```

### Benefits

- **Type Safety**: Catch validation errors at runtime before making API calls
- **Better Error Messages**: Detailed validation errors instead of cryptic API errors
- **Schema Enforcement**: Ensure your API responses match the OpenAPI specification
- **Zero Runtime Overhead**: Validators are generated at compile-time by the wiz plugin

### Limitations

- Only validates `application/json` content type
- Response validation only checks successful responses (200-204 status codes)
- Non-JSON responses are silently skipped

## React Query Integration

The `--react-query` option generates a client optimized for use with [TanStack Query (React Query)](https://tanstack.com/query/latest). This provides a more React-friendly API with context-based configuration and hooks.

### Usage

```bash
wiz client spec.yaml --outdir src/client --react-query
```

### Generated API

When React Query integration is enabled, the generated code includes:

#### 1. ApiContext

A React context for providing API configuration throughout your application:

```typescript
import { ApiContext } from "./client/api";

function App() {
  const apiConfig = {
    baseUrl: "https://api.example.com/v1",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };

  return (
    <ApiContext.Provider value={apiConfig}>
      <YourApp />
    </ApiContext.Provider>
  );
}
```

#### 2. Query Options Methods

For GET, HEAD, and OPTIONS operations, the generator creates functions that return options for `useQuery`:

```typescript
// Generated function signature
export function getGetUserByIdQueryOptions(
  pathParams: GetUserByIdPathParams
): {
  queryKey: unknown[];
  queryFn: () => Promise<User>;
}

// Usage with React Query
import { useQuery } from "@tanstack/react-query";
import { getGetUserByIdQueryOptions } from "./client/api";

function UserProfile({ userId }: { userId: string }) {
  const query = useQuery(
    getGetUserByIdQueryOptions({ userId })
  );

  if (query.isLoading) return <div>Loading...</div>;
  if (query.error) return <div>Error: {query.error.message}</div>;

  return <div>User: {query.data.name}</div>;
}
```

The query key is automatically generated based on the operation name and parameters, ensuring proper caching and invalidation.

#### 3. Mutation Options Methods

For POST, PUT, PATCH, and DELETE operations, the generator creates functions that return options for `useMutation`:

```typescript
// Generated function signature
export function getCreateUserMutationOptions(): {
  mutationFn: (variables: { requestBody: CreateUserRequest }) => Promise<User>;
}

// Usage with React Query
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getCreateUserMutationOptions } from "./client/api";

function CreateUserForm() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    ...getCreateUserMutationOptions(),
    onSuccess: () => {
      // Invalidate and refetch users list
      queryClient.invalidateQueries({ queryKey: ["listUsers"] });
    },
  });

  const handleSubmit = (name: string, email: string) => {
    mutation.mutate({ requestBody: { name, email } });
  };

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      handleSubmit(name, email);
    }}>
      {/* form fields */}
    </form>
  );
}
```

#### 4. Custom Hooks (Placeholder)

The generator also creates custom hook stubs for each endpoint:

```typescript
export function useGetUserById(pathParams: GetUserByIdPathParams, options?: { enabled?: boolean });

export function useCreateUser(options?: any);
```

**Note**: These hooks currently throw an error with instructions to use the query/mutation options methods with React Query. This is because the hooks would need to import from `@tanstack/react-query`, which is an optional peer dependency.

To use these hooks, you would need to implement them in your own code:

```typescript
// In your codebase
import { useQuery } from "@tanstack/react-query";

import { getGetUserByIdQueryOptions } from "./client/api";

export function useGetUserById(pathParams: GetUserByIdPathParams, options?: { enabled?: boolean }) {
    return useQuery({
        ...getGetUserByIdQueryOptions(pathParams),
        ...options,
    });
}
```

### Configuration

In React Query mode:

- `ApiContext` provides configuration via React context
- `setGlobalApiConfig()` is available for setting a global fallback config (useful for direct API method calls outside React components)
- The regular `api` object methods still work and use the global config

### Example: Complete React Query Setup

```typescript
// App.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiContext } from "./client/api";

const queryClient = new QueryClient();

function App() {
  const apiConfig = {
    baseUrl: import.meta.env.VITE_API_BASE_URL,
    headers: {
      "Content-Type": "application/json",
    },
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ApiContext.Provider value={apiConfig}>
        <YourApp />
      </ApiContext.Provider>
    </QueryClientProvider>
  );
}

// UserList.tsx
import { useQuery } from "@tanstack/react-query";
import { getListUsersQueryOptions } from "./client/api";

function UserList() {
  const query = useQuery(
    getListUsersQueryOptions({ page: 1, limit: 10 })
  );

  return (
    <div>
      {query.data?.map(user => (
        <div key={user.id}>{user.name}</div>
      ))}
    </div>
  );
}

// CreateUserButton.tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getCreateUserMutationOptions } from "./client/api";

function CreateUserButton() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    ...getCreateUserMutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["listUsers"] });
    },
  });

  return (
    <button
      onClick={() => mutation.mutate({
        requestBody: { name: "John Doe", email: "john@example.com" }
      })}
    >
      Create User
    </button>
  );
}
```

### Benefits

- **Type Safety**: Full TypeScript support with inferred types from your OpenAPI spec
- **Automatic Cache Keys**: Query keys are automatically generated based on operation and parameters
- **React Context**: Configuration managed via React context for better component composition
- **Consistent API**: Same patterns for all endpoints
- **Optimistic Updates**: Easy to implement with React Query's built-in features
- **Separation of Concerns**: API logic separate from React Query logic

### Requirements

- React 16.8+ (for hooks and context)
- `@tanstack/react-query` v5+ (peer dependency, not included)

## Limitations

- Only `application/json` content type is currently supported
- Response types are not generated (returns `Promise<Response>`)
- No automatic retry or error handling
- Validation (with `--wiz-validator`) only validates JSON request/response bodies

## Testing

The implementation includes comprehensive test coverage:

- 16 unit tests for the generator (including validation feature tests)
- 7 integration tests for the CLI (including validation CLI tests)
- All existing tests passing
- Validation tests cover:
    - Path parameter validation
    - Query parameter validation
    - Request body validation
    - Response body validation
    - Behavior with and without `--wiz-validator` flag
