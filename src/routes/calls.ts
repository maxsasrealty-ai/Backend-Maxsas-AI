import { Router } from "express";

import createCallRouter from "./calls/create";
import callDetailRouter from "./calls/detail";
import leadRouter from "./calls/lead";
import listCallsRouter from "./calls/list";
import recordingRouter from "./calls/recording";
import transcriptRouter from "./calls/transcript";

const callsRouter = Router();

callsRouter.use(createCallRouter);
callsRouter.use(listCallsRouter);
callsRouter.use(callDetailRouter);
callsRouter.use(transcriptRouter);
callsRouter.use(recordingRouter);
callsRouter.use(leadRouter);

export default callsRouter;
