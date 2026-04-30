import { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      user?: typeof usersTable.$inferSelect;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  const token = req.cookies?.session_token ?? bearerToken;
  if (!token) {
    res.status(401).json({ error: "unauthenticated", message: "Not logged in" });
    return;
  }

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.sessionToken, token),
  });

  if (!user) {
    res.status(401).json({ error: "unauthenticated", message: "Invalid session" });
    return;
  }

  req.user = user;
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  await requireAuth(req, res, async () => {
    if (!req.user?.isAdmin) {
      res.status(403).json({ error: "forbidden", message: "Admin access required" });
      return;
    }
    next();
  });
}
