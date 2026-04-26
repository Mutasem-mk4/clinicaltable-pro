/**
 * ClinicalTable Pro — Lemon Squeezy Integration
 *
 * Generates checkout URLs for pay-per-table and subscription plans.
 */

const LEMON_SQUEEZY_API_URL = "https://api.lemonsqueezy.com/v1";

interface CheckoutOptions {
  /** User's email for prefilling checkout */
  email?: string;
  /** Internal user ID for webhook reconciliation */
  userId?: string;
  /** Custom success redirect URL */
  successUrl?: string;
}

/**
 * Generate a Lemon Squeezy checkout URL.
 *
 * @param variantId - The Lemon Squeezy product variant ID
 * @param options - Checkout customization options
 * @returns Checkout URL string
 */
export async function createCheckoutUrl(
  variantId: string,
  options: CheckoutOptions = {}
): Promise<string> {
  const apiKey = process.env.LEMON_SQUEEZY_API_KEY;
  const storeId = process.env.LEMON_SQUEEZY_STORE_ID;

  if (!apiKey || !storeId) {
    throw new Error("Lemon Squeezy credentials not configured.");
  }

  const body = {
    data: {
      type: "checkouts",
      attributes: {
        checkout_options: {
          embed: false,
          media: false,
          button_color: "#2D5A27",
        },
        checkout_data: {
          email: options.email || undefined,
          custom: {
            user_id: options.userId || "",
          },
        },
        product_options: {
          redirect_url: options.successUrl || `${process.env.NEXT_PUBLIC_APP_URL || ""}/app?payment=success`,
        },
      },
      relationships: {
        store: {
          data: {
            type: "stores",
            id: storeId,
          },
        },
        variant: {
          data: {
            type: "variants",
            id: variantId,
          },
        },
      },
    },
  };

  const response = await fetch(`${LEMON_SQUEEZY_API_URL}/checkouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/vnd.api+json",
      Accept: "application/vnd.api+json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Lemon Squeezy API error: ${errorText}`);
  }

  const data = await response.json();
  const checkoutUrl = data?.data?.attributes?.url;

  if (!checkoutUrl) {
    throw new Error("Failed to generate checkout URL.");
  }

  return checkoutUrl;
}

/**
 * Product variant IDs — configure these in your Lemon Squeezy dashboard.
 */
export const PLAN_VARIANTS = {
  /** $4.99 per table — one-time purchase */
  perTable: process.env.NEXT_PUBLIC_LS_VARIANT_PER_TABLE || "",
  /** $19/month unlimited — subscription */
  monthly: process.env.NEXT_PUBLIC_LS_VARIANT_MONTHLY || "",
} as const;
