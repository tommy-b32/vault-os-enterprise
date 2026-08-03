import "server-only";

import { NextResponse } from "next/server";
import {
  OperatorAuthorizationError,
  requireAuthenticatedOperator,
  requireOperatorRole,
  type VaultOperatorRole,
} from "@/lib/auth/operators";

export async function authorizeApiRequest(roles?: VaultOperatorRole[]): Promise<NextResponse | null> {
  try {
    if (roles) await requireOperatorRole(...roles);
    else await requireAuthenticatedOperator();
    return null;
  } catch (error) {
    const status = error instanceof OperatorAuthorizationError &&
        error.reason !== "unauthenticated"
      ? 403
      : 401;
    return NextResponse.json(
      { error: status === 403 ? "Forbidden" : "Unauthorized" },
      { status },
    );
  }
}
