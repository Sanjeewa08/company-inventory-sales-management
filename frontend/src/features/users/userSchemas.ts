import { z } from "zod";
import { userRoles } from "../../types/auth";

export const userFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string(),
  role: z.enum(userRoles),
  branchId: z.string(),
}).superRefine((values, context) => {
  if (
    values.role !== "ADMIN" &&
    values.role !== "MANAGER" &&
    !values.branchId
  ) {
    context.addIssue({
      code: "custom",
      message: "A branch is required for this role.",
      path: ["branchId"],
    });
  }
});

export type UserFormValues = z.infer<typeof userFormSchema>;
