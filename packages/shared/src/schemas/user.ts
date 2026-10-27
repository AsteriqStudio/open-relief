import { z } from 'zod';

export const UserRoleSchema = z.enum(['recipient', 'donor', 'admin']);

export const UserSchema = z.object({
  id: z.string().uuid(),
  role: UserRoleSchema,
  email: z.string().email(),
  phone: z.string().min(1),
  createdAt: z.string().datetime({ offset: true }),
}).strict();

export type User = z.infer<typeof UserSchema>;
export type UserRole = z.infer<typeof UserRoleSchema>;
