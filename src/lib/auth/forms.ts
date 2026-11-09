import { readBodyBytes } from "@/lib/http";

// Form posts of the staff pages (staff-accounts, F-03): plain HTML forms (application/x-www-form-urlencoded), read
// without ever buffering more than a few KiB. Pure apart from reading the request.

export const MAX_FORM_BODY_BYTES = 16 * 1024;

export async function readFormBody(
  request: Request,
  limit = MAX_FORM_BODY_BYTES,
): Promise<URLSearchParams | "too-large"> {
  const body = await readBodyBytes(request, limit);
  if (body.status === "too-large") {
    return "too-large";
  }
  if (body.status === "empty") {
    return new URLSearchParams();
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/x-www-form-urlencoded")) {
    return new URLSearchParams();
  }
  return new URLSearchParams(new TextDecoder().decode(body.bytes));
}

// A field's value ("" when missing).
export function formField(form: URLSearchParams, name: string): string {
  return form.get(name) ?? "";
}
