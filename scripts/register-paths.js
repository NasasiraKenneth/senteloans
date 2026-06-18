/**
 * Resolve `@/` imports when running scripts via ts-node (workers, migrations helpers, etc.).
 * Preload: node -r ./scripts/register-paths.js -r ts-node/register ...
 */
const path = require("path")
const Module = require("module")

const root = path.join(__dirname, "..")
const originalResolveFilename = Module._resolveFilename

Module._resolveFilename = function (request, parent, isMain, options) {
  if (typeof request === "string" && request.startsWith("@/")) {
    request = path.join(root, request.slice(2))
  }
  return originalResolveFilename.call(this, request, parent, isMain, options)
}
