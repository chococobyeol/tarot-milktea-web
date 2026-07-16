import {
  apiErrorResponse,
  createAnonymousSession,
  readSafeJson,
  type RuntimeEnv,
} from "@/src/server/security";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readSafeJson(request) as { turnstileToken?: string };
    const { env } = await import("cloudflare:workers");
    return await createAnonymousSession(
      request,
      env as unknown as RuntimeEnv,
      body.turnstileToken ?? "",
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
