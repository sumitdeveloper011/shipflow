import { serve } from "inngest/next";
import { inngest } from "@shipflow/api";
import { onFeatureRequestCreated, onFeatureRequestMessage } from "@shipflow/api/workflows/featureRequest";
import { generatePRD } from "@shipflow/api/workflows/prd";
import { generateTasks } from "@shipflow/api/workflows/tasks";
import { runAIReview, onPRSynchronize } from "@shipflow/api/workflows/review";
import { analyzeRepository } from "@shipflow/api/workflows/repository";
import { checkReleaseReadiness } from "@shipflow/api/workflows/release";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    onFeatureRequestCreated,
    onFeatureRequestMessage,
    generatePRD,
    generateTasks,
    runAIReview,
    onPRSynchronize,
    analyzeRepository,
    checkReleaseReadiness,
  ],
});
