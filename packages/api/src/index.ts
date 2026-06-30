import { router } from "./trpc";
import { workspaceRouter } from "./routers/workspace";
import { projectRouter } from "./routers/project";
import { featureRequestRouter } from "./routers/featureRequest";
import { prdRouter } from "./routers/prd";
import { taskRouter } from "./routers/task";
import { repositoryRouter } from "./routers/repository";
import { reviewRouter } from "./routers/review";
import { releaseRouter } from "./routers/release";
import { billingRouter } from "./routers/billing";

export const appRouter = router({
  workspace: workspaceRouter,
  project: projectRouter,
  featureRequest: featureRequestRouter,
  prd: prdRouter,
  task: taskRouter,
  repository: repositoryRouter,
  review: reviewRouter,
  release: releaseRouter,
  billing: billingRouter,
});

export type AppRouter = typeof appRouter;
export { createContext } from "./trpc";
export { auth } from "./auth";
export { inngest } from "./inngest";
export { githubApp, getPRDiff, postReviewComment, getOctokitForInstallation } from "./github";
export * as workflows from "./workflows/index";

// Re-export db for convenience in API routes
export { db } from "@shipflow/db";
