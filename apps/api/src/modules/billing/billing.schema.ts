import { z } from "zod"

export const createSubscriptionSchema = z.object({
  planCode: z.string().min(1, "套餐编码不能为空"),
})
export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>

export const cancelSubscriptionSchema = z.object({
  cancelAtEnd: z.boolean().default(true),
})
export type CancelSubscriptionInput = z.infer<typeof cancelSubscriptionSchema>

export const createOrderSchema = z.object({
  planCode: z.string().min(1, "套餐编码不能为空"),
  channel: z.enum(["alipay", "wechat"]).optional(),
})
export type CreateOrderInput = z.infer<typeof createOrderSchema>
