import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const routeUrl = new URL(
  "../app/api/product-vision/analyse/route.ts",
  import.meta.url,
);
const source = await readFile(routeUrl, "utf8");

function loadRoute({ authorizeApiRequest, analyseProductVision }) {
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};

  new Function("require", "exports", output)(
    (name) => ({
      "next/server": {
        NextResponse: {
          json: (body, init) => Response.json(body, init),
        },
      },
      "@/lib/auth/api": { authorizeApiRequest },
      "@/lib/ai/analyseProductVision": { analyseProductVision },
    }[name] ?? require(name)),
    exports,
  );

  return exports;
}

function request(body) {
  return new Request("https://vault.test/api/product-vision/analyse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("analyse route exposes only the supported POST runtime export", () => {
  const runtimeExports = [...source.matchAll(
    /^export\s+(?!type\b|interface\b)(?:const|let|var|class|(?:async\s+)?function)\s+([A-Za-z_$][\w$]*)/gm,
  )].map((match) => match[1]);

  assert.deepEqual(runtimeExports, ["POST"]);
  assert.match(source, /from "@\/lib\/ai\/analyseProductVision"/);
  assert.doesNotMatch(source, /export async function analyseProductVision/);
});

test("POST preserves the authorized success payload and input coercion", async () => {
  const calls = [];
  const analysis = {
    vision: { brand: "Vault", confidence: 92 },
    model: "test-model",
  };
  const { POST } = loadRoute({
    authorizeApiRequest: async () => null,
    analyseProductVision: async (input) => {
      calls.push(input);
      return analysis;
    },
  });

  const response = await POST(request({
    productId: " product-1 ",
    productName: " Product one ",
    imageUrl: "https://example.test/image.jpg",
    ignored: true,
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), analysis);
  assert.deepEqual(calls, [{
    productId: " product-1 ",
    productName: " Product one ",
    imageUrl: "https://example.test/image.jpg",
  }]);

  await POST(request({
    productId: 1,
    productName: null,
    imageUrl: {},
  }));
  assert.deepEqual(calls[1], {
    productId: "",
    productName: "",
    imageUrl: "",
  });
});

test("POST preserves authorization, validation, and internal-error responses", async () => {
  const unauthorized = new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
  const blocked = loadRoute({
    authorizeApiRequest: async () => unauthorized,
    analyseProductVision: async () => {
      throw new Error("analysis must not run when denied");
    },
  });
  const deniedResponse = await blocked.POST(request({}));
  assert.equal(deniedResponse, unauthorized);

  const validation = loadRoute({
    authorizeApiRequest: async () => null,
    analyseProductVision: async () => {
      throw new Error("A valid product image URL is required.");
    },
  });
  const validationResponse = await validation.POST(request({ imageUrl: 42 }));
  assert.equal(validationResponse.status, 400);
  assert.deepEqual(await validationResponse.json(), {
    error: "A valid product image URL is required.",
  });

  const internal = loadRoute({
    authorizeApiRequest: async () => null,
    analyseProductVision: async () => {
      throw new Error("provider detail must not leak");
    },
  });
  const internalResponse = await internal.POST(request({}));
  assert.equal(internalResponse.status, 500);
  assert.deepEqual(await internalResponse.json(), {
    error: "Product Vision analysis failed.",
  });
});

test("shared Product Vision implementation remains server-only", async () => {
  const sharedSource = await readFile(
    new URL("../lib/ai/analyseProductVision.ts", import.meta.url),
    "utf8",
  );

  assert.match(sharedSource, /^import "server-only";/m);
  assert.match(sharedSource, /export async function analyseProductVision/);
});
