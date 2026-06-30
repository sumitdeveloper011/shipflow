import { initTRPC, TRPCError } from "@trpc/server";
import { type NextRequest } from "next/server";
import { db } from "@shipflow/db";
import superjson from "superjson";
import { ZodError } from "zod";
import { auth } from "./auth";

export type Context = {
  req: NextRequest;
  session: Awaited<ReturnType<typeof auth.api.getSession>> | null;
  db: typeof db;
};

export async function createContext(req: NextRequest): Promise<Context> {
  const session = await auth.api.getSession({ headers: req.headers });
  return { req, session, db };
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

const enforceAuth = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

export const protectedProcedure = t.procedure.use(enforceAuth);
