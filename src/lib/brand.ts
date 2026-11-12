/** Product name and lines used across the app, emails, PDFs and legal pages. */
export const APP_NAME = "FarmTrace";
export const APP_TAGLINE = "Farm Ledger Portal";
export const APP_DESCRIPTION = "Bookkeeping and NRS e-invoicing for Nigerian farms and agribusinesses.";
/** Contact points named in the privacy policy. Set them in the environment for your deployment. */
export const PRIVACY_EMAIL = process.env.PRIVACY_EMAIL || "privacy@farmtrace.ng";
export const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "support@farmtrace.ng";
/** Bump when the privacy policy or terms change materially; people are asked to accept the new version. */
export const POLICY_VERSION = "2026-11-12";
/** The legal entity that operates this deployment, its address, and its NDPC registration number (if registered). */
export const LEGAL_ENTITY = process.env.LEGAL_ENTITY || "the operator of this FarmTrace service";
export const LEGAL_ADDRESS = process.env.LEGAL_ADDRESS || "Lagos, Nigeria";
export const NDPC_REGISTRATION = process.env.NDPC_REGISTRATION || "";
/** Where the database lives, as named in the privacy policy, e.g. "Frankfurt, Germany (EU)". */
export const DATA_REGION = process.env.DATA_REGION || "the European Union (Frankfurt, Germany)";
