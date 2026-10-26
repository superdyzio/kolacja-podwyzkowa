declare namespace App {
  interface Locals {
    // Set by src/middleware.ts for routes guarded by a link key; null on public routes.
    access: null;
  }
}
