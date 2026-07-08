import { z } from "zod"

export const createProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "项目名称不能为空")
    .max(100, "项目名称不能超过 100 个字符")
    .refine((name) => !/[\\/:*?"<>|]/.test(name), "项目名称不能包含特殊字符"),
})
export type CreateProjectInput = z.infer<typeof createProjectSchema>

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1, "名称不能为空"),
})
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>
