import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { config } from "./lib/config";
import { logger } from "./lib/logger";
import apiRouter from "./routes";

// Load .env if it exists (for native node 20.6+ & local dev)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath) && typeof process.loadEnvFile === "function") {
	process.loadEnvFile(envPath);
}

const app = express();
const publicDir = path.resolve(__dirname, "../public");
const FALLBACK_WEB_APP_BASE = "http://localhost:8081";

function resolveAbsoluteHttpUrl(candidate: string | undefined, fallback: string): string {
	const value = candidate?.trim();
	if (!value) {
		return fallback;
	}

	try {
		const url = new URL(value);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return fallback;
		}

		if (url.protocol === "http:" && !/^(localhost|127\.0\.0\.1)$/i.test(url.hostname)) {
			url.protocol = "https:";
		}

		return url.toString().replace(/\/$/, "");
	} catch {
		return fallback;
	}
}

function resolveRequestBase(req: Request): string {
	const host = req.get("host")?.trim();
	if (host) {
		return resolveAbsoluteHttpUrl(`${req.protocol}://${host}`, FALLBACK_WEB_APP_BASE);
	}

	return FALLBACK_WEB_APP_BASE;
}

const explicitDevOrigins = new Set([
	"http://localhost:8081",
	"http://localhost:19006",
	"http://localhost:3000",
]);

const configuredOrigins = new Set(config.corsAllowedOrigins);

function isSafeNullOriginPath(pathname: string): boolean {
	return (
		pathname === "/payment/payu" ||
		pathname.startsWith("/api/payments/payu") ||
		pathname.startsWith("/api/payment") ||
		pathname.startsWith("/api/wallet")
	);
}

function isAllowedOrigin(origin: string | undefined, pathname: string, requestOrigin?: string): boolean {
	if (!origin) {
		return true;
	}

	if (origin === "null") {
		return isSafeNullOriginPath(pathname) || config.APP_ENV !== "production";
	}

	if (explicitDevOrigins.has(origin)) {
		return true;
	}

	if (configuredOrigins.has(origin)) {
		return true;
	}

	if (requestOrigin && origin === requestOrigin) {
		return true;
	}

	// Expo web can auto-pick different localhost ports when defaults are occupied.
	if (config.APP_ENV !== "production" && /^http:\/\/localhost:\d+$/.test(origin)) {
		return true;
	}

    return false;
}

function resolveSameOrigin(req: Request): string | undefined {
	try {
		return new URL(resolveRequestBase(req)).origin;
	} catch {
		return undefined;
	}
}

const corsOptions = {
	origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
		if (isAllowedOrigin(origin, "")) {
			callback(null, true);
			return;
		}

		callback(new Error(`Origin not allowed by CORS: ${origin || "unknown"}`));
	},
	methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
	allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "x-tenant-id"],
	credentials: true,
};

// Mount CORS before everything else — handles preflight.
// PayU return callbacks can arrive with Origin: null during top-level browser navigation,
// so we skip CORS for those specific bridge routes.
app.use((req, res, next) => {
	const sameOrigin = resolveSameOrigin(req);

	if (
		req.path.startsWith("/api/payments/payu/return") ||
		req.path.startsWith("/api/payments/payu/webhook")
	) {
		next();
		return;
	}

	return cors({
		...corsOptions,
		origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
			if (isAllowedOrigin(origin, req.path, sameOrigin)) {
				callback(null, true);
				return;
			}

			callback(new Error(`Origin not allowed by CORS: ${origin || "unknown"}`));
		},
	})(req, res, next);
});

// Webhook endpoint must capture raw JSON before generic JSON parser.
// This MUST come before express.json() middleware
app.use(
	"/api/webhooks/voice/events",
	express.raw({
		type: "application/json",
		limit: "2mb",
	})
);

// Webhook logging middleware (for debugging)
app.use("/api/webhooks", (req, _res, next) => {
	// Skip if already processed by raw middleware
	if (req.path.startsWith("/voice/events") && Buffer.isBuffer(req.body)) {
		const now = new Date().toISOString();
		const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, String(v)]));
		const rawBody = req.body.toString("utf-8");
		let parsedBody: unknown;
		try {
			parsedBody = JSON.parse(rawBody || "{}");
		} catch {
			parsedBody = "invalid_json";
		}
		console.log("[" + now + "] [WEBHOOK] " + req.method + " " + req.path);
		console.log("Headers:", headers);
		console.log("Raw Body:", rawBody);
		console.log("Parsed Body:", JSON.stringify(parsedBody, null, 2));
		console.log("---");
	}
	next();
});

// Express v5 requires named wildcard, not bare *
app.options("/{*path}", (req, res, next) => {
	const sameOrigin = resolveSameOrigin(req);

	return cors({
		...corsOptions,
		origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
			if (isAllowedOrigin(origin, req.path, sameOrigin)) {
				callback(null, true);
				return;
			}

			callback(new Error(`Origin not allowed by CORS: ${origin || "unknown"}`));
		},
	})(req, res, next);
});

app.use(
	express.json({
		limit: "2mb",
		verify: (req: Request, _res: Response, buffer: Buffer) => {
			req.rawBody = buffer.toString("utf-8");
		},
	})
);

app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => {
	res.status(200).json({
		success: true,
		data: {
			message: "Maxsas backend is running",
		},
	});
});

app.get("/health", (_req, res) => {
	res.status(200).json({
		success: true,
		data: {
			status: "ok",
			service: "maxsas-backend",
			timestamp: new Date().toISOString(),
		},
	});
});

if (fs.existsSync(publicDir)) {
	app.get("/globals.css", (_req, res) => {
		res.type("text/css");
		res.sendFile(path.join(publicDir, "globals.css"));
	});
	app.use("/admin-ui", express.static(publicDir));
	app.use("/mc-assets", express.static(path.join(publicDir, "mc-assets")));
	app.get("/admin", (_req, res) => {
		res.sendFile(path.join(publicDir, "admin.html"));
	});
	app.get("/admin-panel", (_req, res) => {
		res.sendFile(path.join(publicDir, "admin_panel.html"));
	});
	// Serve master control panel (custom admin UI)
	app.get("/admin/master-control", (_req, res) => {
		res.sendFile(path.join(publicDir, "master-control.html"));
	});
	app.get("/delete-account", (_req, res) => {
		res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
		res.setHeader("Cache-Control", "no-store");
		res.sendFile(path.join(publicDir, "delete-account.html"));
	});
	app.get("/account/settings", (_req, res) => {
		res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
		res.setHeader("Cache-Control", "no-store");
		res.sendFile(path.join(publicDir, "account-settings.html"));
	});
}

app.get("/admin/dev-monitor/calls", (req, res) => {
	const suffix = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
	res.redirect(307, `/api/admin/dev-monitor/calls${suffix}`);
});

app.get("/admin/dev-monitor/payments", (req, res) => {
	const suffix = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
	res.redirect(307, `/api/admin/dev-monitor/payments${suffix}`);
});

app.get("/admin/dev-monitor/payment-events/:id", (req, res) => {
	const suffix = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
	res.redirect(307, `/api/admin/dev-monitor/payment-events/${encodeURIComponent(req.params.id)}${suffix}`);
});

app.get("/payments-panel", (_req, res) => {
	res.sendFile(path.join(publicDir, "payments_panel.html"));
});

app.get("/payment/payu", (req, res) => {
	const paymentStatus = String(req.query.payment || req.query.status || "").toLowerCase();
	const safeStatus = paymentStatus === "failure" ? "failure" : "success";
	const txnid = typeof req.query.txnid === "string" ? req.query.txnid : "";
	const mihpayid = typeof req.query.mihpayid === "string" ? req.query.mihpayid : "";
	const paymentOrderId = typeof req.query.payment_order_id === "string" ? req.query.payment_order_id : "";
	const merchantTxnId = typeof req.query.merchant_txn_id === "string" ? req.query.merchant_txn_id : "";
	const amount = typeof req.query.amount === "string" ? req.query.amount : "";
	const error = typeof req.query.error === "string" ? req.query.error : "";
	const reason = typeof req.query.reason === "string" ? req.query.reason : "";
	const errorMessage = typeof req.query.error_Message === "string" ? req.query.error_Message : "";
	const webAppBase = resolveAbsoluteHttpUrl(
		process.env.EXPO_PUBLIC_WEB_APP_URL || process.env.PAYU_REDIRECT_URL,
		resolveRequestBase(req)
	);

	const payload = {
		payment: safeStatus,
		txnid,
		mihpayid,
		paymentOrderId,
		merchantTxnId,
		amount,
		error,
		reason,
		errorMessage,
		webAppBase,
	};

	logger.info("PayU bridge redirect context prepared", {
		paymentStatus: safeStatus,
		paymentOrderId,
		merchantTxnId,
		webAppBase,
		redirectPath: "/lexus/wallet",
	});

	// Serve an intermediate polling page that will query the public status endpoint
	const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Processing payment</title></head><body><div style="font-family:system-ui,Segoe UI,Roboto,Arial;max-width:680px;margin:40px auto;padding:24px;border-radius:12px;border:1px solid #e6eef6;background:#fff">\n<h2>Processing payment...</h2>\n<p>Please wait while we confirm your payment. You will be redirected automatically.</p>\n</div>\n<script>
	const payload = ${JSON.stringify(payload)};
	const publicStatusUrl = '/api/payments/public/status';
	const webAppBase = payload.webAppBase || location.origin;
	const buildRedirect = (status) => {
		const u = new URL('/lexus/wallet', webAppBase);
		u.searchParams.set('payment', status);
		if (payload.txnid) u.searchParams.set('txnid', payload.txnid);
		if (payload.mihpayid) u.searchParams.set('mihpayid', payload.mihpayid);
		if (payload.paymentOrderId) u.searchParams.set('payment_order_id', payload.paymentOrderId);
		if (payload.merchantTxnId) u.searchParams.set('merchant_txn_id', payload.merchantTxnId);
		if (payload.amount) u.searchParams.set('amount', payload.amount);
		if (payload.error) u.searchParams.set('error', payload.error);
		if (payload.reason) u.searchParams.set('reason', payload.reason);
		if (payload.errorMessage) u.searchParams.set('error_Message', payload.errorMessage);
		console.info('PayU bridge redirect built', { webAppBase, status, target: u.toString() });
		return u.toString();
	};

	(async function poll() {
		const merchant = payload.merchantTxnId || payload.paymentOrderId || '';
		if (!merchant) {
			// No merchant id — fallback to direct redirect
			location.href = buildRedirect(payload.payment);
			return;
		}

		let attempt = 0;
		let delay = 1000;
		const maxAttempts = 12;
		while (attempt < maxAttempts) {
			attempt++;
			try {
				const params = new URLSearchParams();
				params.set('merchant_txn_id', merchant);
				const res = await fetch(publicStatusUrl + '?' + params.toString(), { method: 'GET', credentials: 'omit' });
				if (res.ok) {
					const body = await res.json();
					if (body && body.success && body.data) {
						const status = String(body.data.status || '').toLowerCase();
						const walletCredited = Boolean(body.data.walletCredited);
						if (walletCredited || ['completed','success','paid'].includes(status)) {
							location.href = buildRedirect('success');
							return;
						}
						if (['failure','failed','cancelled'].includes(status)) {
							location.href = buildRedirect('failure');
							return;
						}
					}
				}
			} catch (e) {
				// ignore and retry
			}
			await new Promise(r => setTimeout(r, delay));
			delay = Math.min(8000, Math.floor(delay * 1.8));
		}
		// timed out — send user to wallet with processing state
		location.href = buildRedirect('processing');
	})();
</script></body></html>`;

	res.setHeader('Cache-Control', 'no-store');
	res.setHeader('X-Frame-Options', 'DENY');
	res.type('text/html');
	res.send(html);
});

// PayU may POST the checkout result to the return URL (form-encoded). Accept POSTs as well.
app.post(
	"/payment/payu",
	express.urlencoded({ extended: true, limit: "2mb" }),
	(req, res) => {
		const paymentStatus = String(req.body.payment || req.body.status || "").toLowerCase();
		const safeStatus = paymentStatus === "failure" ? "failure" : "success";
		const txnid = typeof req.body.txnid === "string" ? req.body.txnid : "";
		const mihpayid = typeof req.body.mihpayid === "string" ? req.body.mihpayid : "";
		const paymentOrderId = typeof req.body.payment_order_id === "string" ? req.body.payment_order_id : "";
		const merchantTxnId = typeof req.body.merchant_txn_id === "string" ? req.body.merchant_txn_id : "";
		const amount = typeof req.body.amount === "string" ? req.body.amount : "";
		const error = typeof req.body.error === "string" ? req.body.error : "";
		const reason = typeof req.body.reason === "string" ? req.body.reason : "";
		const errorMessage = typeof req.body.error_Message === "string" ? req.body.error_Message : "";
		const webAppBase = resolveAbsoluteHttpUrl(
			process.env.EXPO_PUBLIC_WEB_APP_URL || process.env.PAYU_REDIRECT_URL,
			resolveRequestBase(req)
		);

		const payload = {
			payment: safeStatus,
			txnid,
			mihpayid,
			paymentOrderId,
			merchantTxnId,
			amount,
			error,
			reason,
			errorMessage,
			webAppBase,
		};

		logger.info("PayU POST bridge redirect context prepared", {
			paymentStatus: safeStatus,
			paymentOrderId,
			merchantTxnId,
			webAppBase,
			redirectPath: "/lexus/wallet",
		});

		const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Processing payment</title></head><body><div style="font-family:system-ui,Segoe UI,Roboto,Arial;max-width:680px;margin:40px auto;padding:24px;border-radius:12px;border:1px solid #e6eef6;background:#fff">\n<h2>Processing payment...</h2>\n<p>Please wait while we confirm your payment. You will be redirected automatically.</p>\n</div>\n<script>
	const payload = ${JSON.stringify(payload)};
	const publicStatusUrl = '/api/payments/public/status';
	const webAppBase = payload.webAppBase || location.origin;
	const buildRedirect = (status) => {
		const u = new URL('/lexus/wallet', webAppBase);
		u.searchParams.set('payment', status);
		if (payload.txnid) u.searchParams.set('txnid', payload.txnid);
		if (payload.mihpayid) u.searchParams.set('mihpayid', payload.mihpayid);
		if (payload.paymentOrderId) u.searchParams.set('payment_order_id', payload.paymentOrderId);
		if (payload.merchantTxnId) u.searchParams.set('merchant_txn_id', payload.merchantTxnId);
		if (payload.amount) u.searchParams.set('amount', payload.amount);
		if (payload.error) u.searchParams.set('error', payload.error);
		if (payload.reason) u.searchParams.set('reason', payload.reason);
		if (payload.errorMessage) u.searchParams.set('error_Message', payload.errorMessage);
		return u.toString();
	};

	(async function poll() {
		const merchant = payload.merchantTxnId || payload.paymentOrderId || '';
		if (!merchant) {
			// No merchant id — fallback to direct redirect
			location.href = buildRedirect(payload.payment);
			return;
		}

		let attempt = 0;
		let delay = 1000;
		const maxAttempts = 12;
		while (attempt < maxAttempts) {
			attempt++;
			try {
				const params = new URLSearchParams();
				params.set('merchant_txn_id', merchant);
				const res = await fetch(publicStatusUrl + '?' + params.toString(), { method: 'GET', credentials: 'omit' });
				if (res.ok) {
					const body = await res.json();
					if (body && body.success && body.data) {
						const status = String(body.data.status || '').toLowerCase();
						const walletCredited = Boolean(body.data.walletCredited);
						if (walletCredited || ['completed','success','paid'].includes(status)) {
							location.href = buildRedirect('success');
							return;
						}
						if (['failure','failed','cancelled'].includes(status)) {
							location.href = buildRedirect('failure');
							return;
						}
					}
				}
			} catch (e) {
				// ignore and retry
			}
			await new Promise(r => setTimeout(r, delay));
			delay = Math.min(8000, Math.floor(delay * 1.8));
		}
		// timed out — send user to wallet with processing state
		location.href = buildRedirect('processing');
	})();
</script></body></html>`;

		res.setHeader('Cache-Control', 'no-store');
		res.setHeader('X-Frame-Options', 'DENY');
		res.type('text/html');
		res.send(html);
	}
);

app.get("/admin/dev-monitor/logs", (req, res) => {
	const suffix = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
	res.redirect(307, `/api/admin/dev-monitor/logs${suffix}`);
});

app.get("/admin/dev-monitor/call-events/:call_id", (req, res) => {
	const suffix = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
	res.redirect(307, `/api/admin/dev-monitor/call-events/${req.params.call_id}${suffix}`);
});

app.use("/api", apiRouter);

app.use((req, res) => {
	res.status(404).json({
		success: false,
		error: {
			code: "NOT_FOUND",
			message: `Route not found: ${req.method} ${req.originalUrl}`,
		},
	});
});

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
	res.status(500).json({
		success: false,
		error: {
			code: "INTERNAL_SERVER_ERROR",
			message: error.message || "Unexpected server error",
		},
	});
});

export default app;
