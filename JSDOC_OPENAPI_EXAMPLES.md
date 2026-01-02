# JSDoc-Based OpenAPI Path Declaration Examples

Wiz now supports declaring OpenAPI paths using JSDoc comments on functions. This provides a more natural way to document your API endpoints alongside your implementation.

## Basic Usage

### Simple GET Endpoint

```typescript
/**
 * Get all users
 * @openApi
 * @path /users
 */
function getUsers() {}
```

### Specifying HTTP Method

```typescript
/**
 * Create a new user
 * @openApi
 * @method POST
 * @path /users
 */
function createUser() {}
```

**Supported methods:** GET (default), POST, PUT, PATCH, DELETE, HEAD, OPTIONS, TRACE

## Path Parameters

Define path parameters with type information:

```typescript
/**
 * Get user by ID
 * @openApi
 * @path /users/:id {id: number}
 */
function getUserById() {}
```

Multiple path parameters:

```typescript
/**
 * @openApi
 * @path /orgs/:orgId/users/:userId {orgId: string, userId: number}
 */
function getOrgUser() {}
```

## Query Parameters

```typescript
/**
 * Search users
 * @openApi
 * @path /users
 * @query {search: string, limit?: number, offset?: number}
 */
function searchUsers() {}
```

- Required parameters: `{name: type}`
- Optional parameters: `{name?: type}`

## Headers

```typescript
/**
 * @openApi
 * @path /users
 * @headers {Authorization: string, X-API-Key?: string}
 */
function getUsers() {}
```

## Request Body

Reference types from your schema:

```typescript
type CreateUserRequest = {
    name: string;
    email: string;
};

/**
 * @openApi
 * @method POST
 * @path /users
 * @body CreateUserRequest
 */
function createUser() {}
```

With custom content type:

```typescript
/**
 * @openApi
 * @method POST
 * @path /upload
 * @body multipart/form-data FileData
 */
function uploadFile() {}
```

## Responses

### Single Response

```typescript
/**
 * @openApi
 * @path /users/:id
 * @response 200 User - Successfully retrieved user
 */
function getUser() {}
```

### Multiple Responses

```typescript
/**
 * @openApi
 * @path /users/:id
 * @response 200 User - User found
 * @response 404 - User not found
 * @response 500 - Internal server error
 */
function getUser() {}
```

### Response with Custom Content Type

```typescript
/**
 * @openApi
 * @path /report
 * @response 200 application/pdf Report - PDF report
 */
function getReport() {}
```

## Operation Metadata

### Operation ID

```typescript
/**
 * @openApi
 * @path /users/:id
 * @operationId getUserById
 */
function getUser() {}
```

If not specified, operation ID defaults to the function name.

### Tags

```typescript
/**
 * @openApi
 * @path /users
 * @tag users
 * @tag public
 */
function getUsers() {}
```

### Deprecated Endpoints

```typescript
/**
 * @openApi
 * @path /old-endpoint
 * @deprecated
 */
function oldEndpoint() {}
```

## Summary and Description

The first line of the JSDoc comment becomes the summary, and subsequent lines become the description:

```typescript
/**
 * Get user by ID
 *
 * Retrieves detailed information about a user including
 * their profile, preferences, and activity history.
 *
 * @openApi
 * @path /users/:id
 */
function getUserById() {}
```

## Complete Example

```typescript
import { createOpenApi } from "wiz/openApiSchema";

type User = {
    id: number;
    name: string;
    email: string;
};

type CreateUserRequest = {
    name: string;
    email: string;
};

/**
 * Get all users
 *
 * Retrieves a paginated list of all users in the system.
 * Results can be filtered using query parameters.
 *
 * @openApi
 * @method GET
 * @path /users
 * @tag users
 * @query {search?: string, limit?: number, offset?: number}
 * @response 200 User[] - List of users
 */
function getAllUsers() {}

/**
 * Get user by ID
 *
 * @openApi
 * @path /users/:id {id: number}
 * @tag users
 * @operationId getUserById
 * @response 200 User - User found
 * @response 404 - User not found
 */
function getUser() {}

/**
 * Create a new user
 *
 * @openApi
 * @method POST
 * @path /users
 * @tag users
 * @body CreateUserRequest
 * @response 201 User - User created successfully
 * @response 400 - Invalid request
 */
function createUser() {}

/**
 * Update user
 *
 * @openApi
 * @method PUT
 * @path /users/:id {id: number}
 * @tag users
 * @body CreateUserRequest
 * @response 200 User - User updated
 * @response 404 - User not found
 */
const updateUser = () => {};

/**
 * Delete user
 *
 * @openApi
 * @method DELETE
 * @path /users/:id {id: number}
 * @tag users
 * @response 204 - User deleted
 * @response 404 - User not found
 * @deprecated Use deactivateUser instead
 */
function deleteUser() {}

// Generate the full OpenAPI spec
export const apiSpec = createOpenApi<[User, CreateUserRequest], "3.0">({
    info: {
        title: "User Management API",
        version: "1.0.0",
        description: "API for managing users",
    },
    servers: [
        {
            url: "https://api.example.com/v1",
        },
    ],
});
```

## Works With All Function Types

JSDoc-based path declarations work with:

- **Function declarations**: `function foo() {}`
- **Arrow functions**: `const foo = () => {}`
- **Function expressions**: `const foo = function() {}`

## Integration with Other Path Declaration Methods

JSDoc-based paths are merged with:

1. Paths declared in the `createOpenApi()` config object
2. Paths declared using the `path()` builder API
3. Paths declared using the `typedPath()` helper

All three methods can be used together in the same project.

## Type References

When you reference a type in `@body` or `@response` tags, Wiz will:

1. Check if the type is included in the schema tuple (e.g., `createOpenApi<[User, CreateUserRequest]>`)
2. If found, generate a `$ref` to `#/components/schemas/TypeName`
3. If not found, generate an inline schema based on the type string (e.g., `string`, `number`)

## Notes

- The `@openApi` tag is **required** - without it, the function is ignored
- The `@path` tag is **required** - it specifies the endpoint path
- The `@method` tag defaults to `GET` if not specified
- Parameter types must be TypeScript primitive types (string, number, boolean) or references to types in your schema
