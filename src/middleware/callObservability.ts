import { NextFunction, Request, Response } from "express";

function pickHeaders(headers: Request["headers"]): Record<string, string> {
  const keys = ["x-tenant-id", "content-type", "user-agent", "x-request-id"];
  const selected: Record<string, string> = {};

  for (const key of keys) {
    const value = headers[key];
    if (typeof value === "string") {
      selected[key] = value;
    }
  }

  return selected;
}

export function captureIncomingCallRequest(req: Request, res: Response, next: NextFunction): void {
  res.locals.callObservability = {
    route: `${req.method} ${req.originalUrl}`,
    headers: pickHeaders(req.headers),
    body: req.body ?? {},
    capturedAt: new Date().toISOString(),
    requestId: req.requestContext?.requestId ?? null,
  };

  next();
}
