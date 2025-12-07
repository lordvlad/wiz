// src/__test__/.tmp/src.ts
var schema = {
type: "object",
properties: {
id: {
type: "number"
},
name: {
type: "string"
},
isActive: {
type: "boolean"
},
tags: {
type: "array",
items: {
type: "string"
}
},
metadata: {
type: "object",
properties: {
createdAt: {
type: "string"
},
updatedAt: {
type: "string"
}
}
}
}
};
export {
schema
};