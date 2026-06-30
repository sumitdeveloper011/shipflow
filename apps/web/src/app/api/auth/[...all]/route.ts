export const dynamic = "force-dynamic";
import { auth } from "@shipflow/api";
import { toNextJsHandler } from "better-auth/next-js";

export const { POST, GET } = toNextJsHandler(auth);
