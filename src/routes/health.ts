import { Request, Response, Router } from "express";

const healthRouter = Router();

healthRouter.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      status: "ok",
      service: "maxsas-backend",
      timestamp: new Date().toISOString(),
    },
  });
});

export default healthRouter;
