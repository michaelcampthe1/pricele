import type { Instrumentation } from "next";

/**
 * Server error hook. Logs a structured line for every unhandled request error. This is the
 * integration point for an external monitoring service (e.g. forward to Sentry here).
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const err = error as Error & { digest?: string };
  console.error(
    JSON.stringify({
      level: "error",
      event: "request.unhandled_error",
      digest: err.digest,
      message: err.message,
      path: request.path.split("?")[0],
      method: request.method,
      requestId: (request.headers["x-request-id"] as string | undefined) ?? undefined,
      routeType: context.routeType,
      time: new Date().toISOString(),
    }),
  );
};
