import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address.").max(254));

export const roleSchema = z.enum(["ADMIN", "USER"]);

// Only http(s) service links are allowed — blocks javascript:, data:, etc.
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

export const roleNameSchema = z.string().trim().min(1, "Role name is required.").max(60);

export const totpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code.");

export const createUserSchema = z.object({
  email: emailSchema,
  role: roleSchema,
});

export const createLinkSchema = z.object({
  title: linkTitleSchema,
  url: serviceUrlSchema,
});

export const updateLinkSchema = z.object({
  id: z.string().min(1),
  title: linkTitleSchema,
  url: serviceUrlSchema,
});
