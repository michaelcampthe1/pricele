"use server";

import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/rate-limit";
import { clientKey } from "@/lib/security/request";
import { fieldErrors } from "@/lib/validation";
import { log } from "@/lib/errors/log";
import type { FormState } from "@/lib/auth/actions";

const schema = z.object({
  message: z.string().trim().min(5, "Tell us a little more (at least 5 characters).").max(2000),
  contact: z.string().trim().max(200).transform((v) => v || null),
});

export async function submitFeedbackAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { message: String(formData.get("message") ?? ""), contact: String(formData.get("contact") ?? "") };
  // Honeypot field: real users never fill it.
  if (String(formData.get("website") ?? "") !== "") return { ok: true, message: "Thanks — your message was sent." };
  const parsed = schema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  if (!(await rateLimit("feedback", await clientKey()))) return { message: "Too many messages. Please try again later.", values };
  const user = await getAuthUser();
  const { error } = await createServiceClient().from("feedback").insert({ user_id: user?.id ?? null, message: parsed.data.message, contact: parsed.data.contact });
  if (error) {
    await log("error", "feedback.insert_failed", { code: error.code });
    return { message: "We couldn't send your message. Please try again.", values };
  }
  return { ok: true, message: "Thanks — your message was sent to the Pricele team." };
}
