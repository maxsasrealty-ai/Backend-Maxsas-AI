import express, { Router } from "express";

import { attachRequestContext } from "../middleware/requestContext";
import leadsModuleRouter from "../modules/leads/leads.router";
import voiceEventsRouter from "../modules/voice-events/voice-events.router";
import accessRouter from "./access";
import adminRouter from "./admin";
import accountDeletionRouter from "./accountDeletion";
import authRouter from "./auth";
import callsRouter from "./calls";
import campaignsRouter from "./campaigns";
import capabilitiesRouter from "./capabilities";
import enterpriseAnalyticsRouter from "./enterprise/analytics";
import healthRouter from "./health";
import paymentRouter from "./payment";
import payuPaymentRouter from "./payuPayment";
import realtimeRouter from "./realtime";
import webinarRouter from "./webinar";
import walletLedgerRouter from "./walletLedger";

const apiRouter = Router();

apiRouter.use(attachRequestContext("api"));
apiRouter.use("/health", healthRouter);
apiRouter.use("/admin", adminRouter);
apiRouter.use("/access", accessRouter);
apiRouter.use("/account", accountDeletionRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/capabilities", capabilitiesRouter);
apiRouter.use("/campaigns", campaignsRouter);
apiRouter.use("/enterprise/analytics", enterpriseAnalyticsRouter);
apiRouter.use("/calls", callsRouter);
apiRouter.use("/leads", leadsModuleRouter);
apiRouter.use("/realtime", realtimeRouter);
apiRouter.use("/webhooks", voiceEventsRouter);

// PayU payment routes (webhook needs raw body)
apiRouter.use(
  "/payments/payu/webhook",
  express.raw({ type: "application/json" }),
  payuPaymentRouter
);

// PayU payment routes with JSON body
apiRouter.use("/payments", payuPaymentRouter);

// Wallet ledger routes
apiRouter.use("/wallet", walletLedgerRouter);

// Webinar registration and payment flow
apiRouter.use("/webinar", webinarRouter);
// Compatibility alias for admin UIs and deployed environments that expect the admin-prefixed route.
apiRouter.use("/admin/webinar", webinarRouter);

// Legacy Razorpay webhook needs raw body before express.json() has a chance to parse it.
// Mount it before the json-parsing wrapper, using express.raw() for this specific path.
apiRouter.use(
  "/payment/webhook",
  express.raw({ type: "application/json" }),
  paymentRouter
);

// Mount remaining Razorpay payment routes with normal JSON body.
apiRouter.use("/payment", paymentRouter);

export default apiRouter;
