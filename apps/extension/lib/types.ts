/** Monetary review amounts use integer cents; only the YNAB boundary converts
 * them to negative milliunits (cents * -10). Local learning is plan-scoped. */
export interface LearnedProduct {
  /** Format: "{planId}:{retailer}:{productId}" — see learnedKey in db.ts. */
  id: string;
  /** The plan this row was learned on. */
  planId: string;
  /** YNAB category UUID. */
  categoryId: string;
}

/**
 * One vector in the embedding similarity pool. Capped per-category;
 * evicted oldest-first by `lastSeen` when a category fills.
 *
 * Stored in the `productEmbeddings` IndexedDB store, keyed by id. Pairs
 * 1:1 with a LearnedProduct (same id) while the embedding lives; deletion
 * here does not delete the LearnedProduct cache row.
 */
export interface ProductEmbedding {
  /** Model/version marker for reviewed-history vectors; legacy rows have none. */
  modelId?: string;
  /** Format: "{planId}:{retailer}:{productId}" — same shape as LearnedProduct.id. */
  id: string;
  /** The plan this row was learned on — indexed so reviewed learning reads only the
   *  connected plan's pool. */
  planId: string;
  /** Denormalized from LearnedProduct so scoring can group by category
   *  without a per-row join; kept in sync because approval writes both. */
  categoryId: string;
  /** Empty for reviewed learning. Historical upstream rows may contain text;
   * they stay dormant until explicitly removed through local cleanup. */
  title: string;
  /** 384-dim L2-normalized embedding vector. */
  embedding: Float32Array;
  /** ISO datetime — last time this product was approved. Drives eviction. */
  lastSeen: string;
}

/**
 * A YNAB category, synced from the user's plan.
 *
 * Stored in the `categories` IndexedDB store, keyed by id.
 * Refreshed via GET /plans/{id}/categories.
 */
export interface Category {
  /** YNAB category UUID. */
  id: string;
  /** Display name, e.g. "Groceries", "Rent". */
  name: string;
  /** YNAB category group name, e.g. "Frequent", "Non-Monthly". */
  groupName: string;
}

export interface AmazonCaPageCheck {
  page: "transactions" | "login" | "other";
  language: "english" | "other" | "unknown";
  rowsFound: number;
  readableRows: number;
  linkedRows: number;
  cadRows: number;
  unspecifiedCurrencyRows: number;
  otherCurrencyRows: number;
  unreadableAmountRows: number;
  truncated: boolean;
}

export interface SplitChargeSelection {chargeIndex:number;assignments:number[]}
export type AdjustmentKind = "fee" | "shipping" | "coupon" | "gift";
/** Whole product row indices only. Amounts always come from the freshly read order. */
export interface AdjustmentPolicy {kind:AdjustmentKind;mode:"all"|"selected"|"category";method:"equal"|"proportional";items:number[]}
export interface PurchaseDestination {planName:string;accountName:string}
export interface PurchaseSavedReceipt {destination?:PurchaseDestination;date:string;totalCents:number;lines:{categoryName:string;cents:number}[];learningSaved:boolean}
export interface PurchaseOrderSession {receipts:PurchaseSavedReceipt[];complete:boolean;orderTotalCents:number;pending?:{state:"saving"|"uncertain";date:string;totalCents:number}}
export interface PurchaseApprovalPreview { paymentDate?:string;destination?:PurchaseDestination;approvalId:string; expiresAt:number;date:string;totalCents:number;lines:{categoryName:string;cents:number}[] }

export type PurchaseSuggestionSource = "exact" | "history" | "model";
export interface PurchaseReview { planName?:string;matchedCharges?:{date:string;cents:number;eligible?:boolean}[]; reviewId?:string; items: { title: string; suggestedCategoryId?: string | null; suggestionSource?: PurchaseSuggestionSource | null; cardCents: number | null; quantity?: number | null; priceCents?: number }[]; totalCents: number; summary?: {subtotalCents:number;shippingCents:number;shippingChargeCents?:number;shippingCreditCents?:number;couponCents?:number;feeCents:number;taxCents:number;giftCents:number}; allocationPending?: boolean }

export type MessageRequest =
  | {type:"GET_PURCHASE_ORDER_SESSION";orderKey:string}
  | {type:"SUSPEND_PURCHASE_REVIEW";reviewId?:string}
  | {type:"GET_PURCHASE_REVIEW_TAB";reviewId:string}
  | {type:"REOPEN_PURCHASE_REVIEW_TAB";reviewId:string}
  | {type:"PREPARE_PURCHASE_APPROVAL";reviewId:string;lineTotals:boolean[];categories:{id:string;name:string}[];confirmed:boolean;split?:SplitChargeSelection;adjustments?:AdjustmentPolicy[]}
  | {type:"APPLY_PURCHASE_APPROVAL";approvalId:string;confirmed:boolean}
  | {type:"CANCEL_PURCHASE_APPROVAL";id?:string}
  | { type: "REVIEW_CA_PURCHASE"; confirmed: boolean }
  | { type: "PREVIEW_LOCAL_DATA_DELETE" }
  | { type: "DELETE_LOCAL_DATA"; approvalId: string; confirmed: boolean }
  | { type: "CANCEL_LOCAL_DATA_DELETE"; approvalId: string }
  | { type: "GET_SETTINGS" }
  | { type: "CONNECT_TOKEN"; token: string }
  | { type: "GET_PLANS" }
  | { type: "SAVE_PLAN"; planId: string; planName: string }
  | { type: "REFRESH_CATEGORIES" }
  | { type: "GET_CATEGORIES" }
  | { type: "CLEAR_SETTINGS" };

export interface LocalDataCounts {
  allocatedTransactions: number;
  learnedProducts: number;
  productEmbeddings: number;
  categories: number;
}

export interface LocalDataDeletePreview {
  approvalId: string;
  expiresAt: number;
  counts: LocalDataCounts;
}

/** Safe, fixed test proposal. All private binding data remains in background memory. */
