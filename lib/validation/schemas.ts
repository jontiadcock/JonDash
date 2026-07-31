import { z } from "zod";

/** ⚠ Lower-cases before validating, so an account cannot be created twice under different
 *  casing. REFS app/login/actions.ts · app/welcome/actions.ts · app/admin/email/actions.ts */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address.").max(254));

export const roleSchema = z.enum(["ADMIN", "USER"]);

// ⚠ Only http(s) — this is what blocks `javascript:` and `data:` URLs from becoming a tile that
// every member of a Service Group can click. REFS lib/services.ts › VisibleLink.url
export const serviceUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((val) => {
    try {
      const u = new URL(val);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }, "Enter a valid http(s) URL.");

export const linkTitleSchema = z.string().trim().min(1, "Title is required.").max(80);

/** REFS app/admin/actions.ts — Service Group names */
export const roleNameSchema = z.string().trim().min(1, "Role name is required.").max(60);

/** REFS app/admin/access-roles/actions.ts — Access Role names, a separate concept from above */
export const accessRoleNameSchema = z
  .string()
  .trim()
  .min(1, "Access role name is required.")
  .max(60);

/** REFS app/login/actions.ts · app/welcome/actions.ts · app/setup/[token]/actions.ts */
export const totpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code.");

/** REFS app/admin/actions.ts — the three link/user forms below all live there */
export const createUserSchema = z.object({
  email: emailSchema,
  role: roleSchema,
});

/** REFS app/admin/actions.ts — the create form */
export const createLinkSchema = z.object({
  title: linkTitleSchema,
  url: serviceUrlSchema,
});

/** REFS app/admin/actions.ts — the edit form */
export const updateLinkSchema = z.object({
  id: z.string().min(1),
  title: linkTitleSchema,
  url: serviceUrlSchema,
});
