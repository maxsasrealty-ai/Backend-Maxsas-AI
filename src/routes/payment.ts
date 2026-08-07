import { Request, Response, Router } from "express";
import { requireTenant } from "../middleware/requireTenant";
import { upsertTenant } from "../repositories/tenantRepository";
import {
    createTopUpOrder,
    fetchWalletBalance,
    fetchWalletTransactions,
    handleRazorpayWebhook,
    verifyRazorpayPayment,
} from "../services/paymentService";

const paymentRouter = Router();

// ─── POST /api/payment/create-order ──────────────────────────────────────
// Body: { amountPaise: number }  (e.g. 100000 = ₹1000)
paymentRouter.post(
  "/create-order",
  requireTenant,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.requestContext?.tenantId as string;
    const rawAmount = req.body?.amountPaise;

    if (typeof rawAmount !== "number" || !Number.isInteger(rawAmount) || rawAmount <= 0) {
      res.status(400).json({
        success: false,
        error: { code: "INVALID_AMOUNT", message: "amountPaise must be a positive integer (paise, e.g. 100000 = ₹1000)" },
      });
      return;
    }

    try {
      // Ensure tenant row exists
      await upsertTenant({ tenantId });
      const result = await createTopUpOrder(tenantId, rawAmount);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      res.status(400).json({
        success: false,
        error: { code: "ORDER_FAILED", message: (err as Error).message },
      });
    }
  }
);

// ─── POST /api/payment/verify ─────────────────────────────────────────────
paymentRouter.post(
  "/verify",
  requireTenant,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.requestContext?.tenantId as string;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      res.status(400).json({
        success: false,
        error: { code: "MISSING_PARAMETERS", message: "razorpay_order_id, razorpay_payment_id, and razorpay_signature are required" },
      });
      return;
    }

    try {
      await verifyRazorpayPayment(tenantId, razorpay_order_id, razorpay_payment_id, razorpay_signature);
      res.status(200).json({ success: true, message: "Payment verified successfully" });
    } catch (err) {
      res.status(400).json({
        success: false,
        error: { code: "VERIFICATION_FAILED", message: (err as Error).message },
      });
    }
  }
);

// ─── POST /api/payment/webhook ────────────────────────────────────────────
// Razorpay sends raw body; must NOT use express.json() for this route if checking signature manually over raw body
paymentRouter.post(
  "/webhook",
  // express.raw is applied at mount time in routes/index.ts for this path
  async (req: Request, res: Response): Promise<void> => {
    const sig = req.headers["x-razorpay-signature"];
    if (!sig || typeof sig !== "string") {
      res.status(400).json({
        success: false,
        error: { code: "MISSING_SIGNATURE", message: "x-razorpay-signature header is required" },
      });
      return;
    }

    const rawBody =
      req.body instanceof Buffer
        ? req.body.toString("utf-8")
        : typeof req.body === "string"
        ? req.body
        : JSON.stringify(req.body);

    try {
      const result = await handleRazorpayWebhook(rawBody, sig);
      res.status(200).json({ received: true, eventType: result.eventType });
    } catch (err) {
      res.status(400).json({
        success: false,
        error: { code: "WEBHOOK_ERROR", message: (err as Error).message },
      });
    }
  }
);

// ─── GET /api/wallet/balance ──────────────────────────────────────────────
paymentRouter.get(
  "/balance",
  requireTenant,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.requestContext?.tenantId as string;
    try {
      await upsertTenant({ tenantId });
      const balance = await fetchWalletBalance(tenantId);
      res.status(200).json({ success: true, data: balance });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: { code: "BALANCE_FETCH_FAILED", message: (err as Error).message },
      });
    }
  }
);

// ─── GET /api/wallet/transactions ────────────────────────────────────────
paymentRouter.get(
  "/transactions",
  requireTenant,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.requestContext?.tenantId as string;
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(String(req.query.pageSize ?? "20"), 10)));

    try {
      const result = await fetchWalletTransactions(tenantId, page, pageSize);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: { code: "TRANSACTIONS_FETCH_FAILED", message: (err as Error).message },
      });
    }
  }
);

export default paymentRouter;
