// Realeflow Partner API — TanStack Start server functions.
// These run on the server only; the API key never reaches the browser.
// Follows the same pattern as enrich.functions.ts (auth middleware + zod).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  rfCompsByAddress,
  rfCompsByHash,
  rfDetails,
  rfSearch,
} from "@/lib/realeflow/client.server";
import { resilientRfAutocomplete } from "@/lib/realeflow/autocomplete.server";
import type { SearchRequest, CompsRequest, DetailsInclude } from "@/lib/realeflow/types";

const addressHash = z.string().regex(/^HA[0-9]+-\w+$/, "Invalid address hash");

/** Type-ahead address / place suggestions. */
export const realeflowAutocomplete = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ q: z.string().trim().min(1).max(200) }))
  .handler(async ({ data, context }) => {
    return resilientRfAutocomplete(context.supabase, data.q);
  });

/** Full property record by address hash, with optional includes. */
export const realeflowDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      identifier: addressHash,
      with: z
        .array(z.enum(["history", "parcel", "preforeclosures", "liens"]))
        .optional(),
    }),
  )
  .handler(async ({ data }) => {
    return rfDetails(data.identifier, data.with as DetailsInclude[] | undefined);
  });

/** Comparable properties for a subject property. */
export const realeflowComps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      identifier: addressHash.optional(),
      // Address subject (used when no identifier):
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().length(2).optional(),
      zip: z.string().optional(),
      // Common overrides:
      limit: z.number().int().min(1).max(100).optional(),
      distance: z.number().positive().max(50).optional(),
      source: z.array(z.string()).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { identifier, ...body } = data;
    if (identifier) return rfCompsByHash(identifier, body as CompsRequest);
    if (!body.address || !body.city || !body.state) {
      throw new Error("Provide either an identifier (address hash) or address + city + state");
    }
    return rfCompsByAddress(body as CompsRequest);
  });

/** Multi-filter property search. Requires a geographic anchor. */
export const realeflowSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z
      .object({
        state: z.string().length(2).optional(),
        geolocation: z.object({ lat: z.number(), lng: z.number() }).optional(),
        distance: z.number().positive().max(100).optional(),
        places: z
          .array(
            z.object({
              state: z.string().optional(),
              city: z.string().optional(),
              fips: z.number().optional(),
              zip: z.string().optional(),
            }),
          )
          .max(100)
          .optional(),
        propertyMainCategory: z.enum(["RESIDENTIAL", "COMMERCIAL", "ALL"]).optional(),
        leadTypes: z.array(z.string()).optional(),
        page: z.number().int().min(1).optional(),
        page_size: z.number().int().min(1).max(1000).optional(),
        sort: z.string().optional(),
        direction: z.enum(["asc", "desc"]).optional(),
      })
      .passthrough() // allow the full documented filter surface
      .refine(
        (v) => v.state || v.geolocation || v.places?.length,
        "A geographic anchor is required (state, geolocation or places)",
      )
      .refine(
        (v) => (v.page ?? 1) * (v.page_size ?? 20) <= 10_000,
        "page × page_size cannot exceed 10,000",
      ),
  )
  .handler(async ({ data }) => {
    return rfSearch(data as SearchRequest);
  });
