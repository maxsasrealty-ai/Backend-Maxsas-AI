import { RequestContext } from "./request";

declare global {
  var process: any;
  var Buffer: any;

  namespace Express {
    interface Request {
      rawBody?: string;
      requestContext?: RequestContext;
    }
  }
}

declare module "express";

export { };

