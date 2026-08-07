declare var process: any;
declare var Buffer: any;

declare module "crypto" {
  const crypto: any;
  export = crypto;
}

declare module "express";
