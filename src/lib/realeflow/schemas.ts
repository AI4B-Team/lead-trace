import { z } from "zod";

export const realeflowAddressHashSchema = z
  .string()
  .regex(/^HA[0-9]+-\w+$/, "Invalid address hash");