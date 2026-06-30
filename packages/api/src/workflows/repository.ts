import { inngest } from "../inngest";
import { db } from "@shipflow/db";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { getOctokitForInstallation } from "../github";

export const analyzeRepository = inngest.createFunction(
  { id: "repository-analyze", name: "AI: Analyze Repository" },
  { event: "repository/analyze" },
  async ({ event, step }) => {
    const { repositoryId, workspaceId } = event.data;

    const repoData = await step.run("fetch-repo", async () => {
      const [repo, installation] = await Promise.all([
        db.repository.findUniqueOrThrow({ where: { id: repositoryId } }),
        db.githubInstallation.findUniqueOrThrow({ where: { workspaceId } }),
      ]);
      return { repo, installation };
    });

    // Fetch repo info from GitHub
    const githubData = await step.run("fetch-github-data", async () => {
      const octokit = await getOctokitForInstallation(repoData.installation.installationId);

      const [repoInfo, languages, contents] = await Promise.all([
        octokit.rest.repos.get({ owner: repoData.repo.owner, repo: repoData.repo.name }),
        octokit.rest.repos.listLanguages({ owner: repoData.repo.owner, repo: repoData.repo.name }),
        octokit.rest.repos.getContent({ owner: repoData.repo.owner, repo: repoData.repo.name, path: "" }).catch(() => ({ data: [] })),
      ]);

      // Try to get package.json or similar for tech stack
      let packageJson: Record<string, unknown> | null = null;
      try {
        const pkgResponse = await octokit.rest.repos.getContent({
          owner: repoData.repo.owner,
          repo: repoData.repo.name,
          path: "package.json",
        });
        if ("content" in pkgResponse.data) {
          packageJson = JSON.parse(Buffer.from(pkgResponse.data.content, "base64").toString());
        }
      } catch {
        // no package.json — that's fine
      }

      return {
        description: repoInfo.data.description,
        defaultBranch: repoInfo.data.default_branch,
        languages: Object.keys(languages.data),
        rootFiles: Array.isArray(contents.data)
          ? (contents.data as Array<{ name: string }>).map((f) => f.name)
          : [],
        packageJson,
      };
    });

    // Run AI analysis
    const analysis = await step.run("ai-analysis", async () => {
      const { text } = await generateText({
        model: openai("gpt-4o-mini"),
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content: "You are a senior software architect analyzing a repository to help an AI code reviewer understand the codebase." +
              " Your analysis will be used to:\n" +
              "1. Generate tech-stack-aware engineering tasks\n" +
              "2. Enforce repository-specific conventions during code review\n" +
              "3. Identify risks when reviewing PRs\n\n" +
              "For recommendations: be specific to the detected stack. Explain WHY each recommendation matters." +
              " Bad: use TypeScript. Good: Add strict null checks to tsconfig — the codebase uses optional chaining but tsc strict mode is off, which allows null pointer bugs to reach production.\n\n" +
              "Respond ONLY with valid JSON — no markdown, no code fences.",
          },
          {
            role: "user",
            content: "Repository: " + repoData.repo.owner + "/" + repoData.repo.name + "\n" +
              "Description: " + (githubData.description || "No description") + "\n" +
              "Default Branch: " + githubData.defaultBranch + "\n" +
              "Languages: " + githubData.languages.join(", ") + "\n" +
              "Root Files: " + githubData.rootFiles.join(", ") + "\n" +
              "Package.json Dependencies: " + (githubData.packageJson ? JSON.stringify((githubData.packageJson as { dependencies?: Record<string, string> }).dependencies || {}, null, 2) : "N/A") + "\n\n" +
              "Analyze this repository and respond with:\n" +
              "{\n" +
              "  \"techStack\": [\"string - primary technologies detected\"],\n" +
              "  \"frameworks\": [\"string - frameworks and libraries\"],\n" +
              "  \"architecture\": \"string - architecture pattern with key structural observations\",\n" +
              "  \"testingSetup\": \"string - testing framework and coverage approach, or Unknown\",\n" +
              "  \"ciSetup\": boolean,\n" +
              "  \"dockerized\": boolean,\n" +
              "  \"conventions\": [\"string - specific conventions to enforce in PR reviews\"],\n" +
              "  \"reviewChecklist\": [\"string - items AI reviewer should always check for PRs in this repo, with WHY\"],\n" +
              "  \"summary\": \"string - 2-3 sentence summary for developers joining this project\",\n" +
              "  \"recommendations\": [\"string - specific actionable improvement with WHY it matters for this stack\"]\n" +
              "}",
          },
        ],
      });

      try {
        return JSON.parse(text) as {
          techStack: string[];
          frameworks: string[];
          architecture: string;
          testingSetup: string;
          ciSetup: boolean;
          dockerized: boolean;
          conventions: string[];
          reviewChecklist: string[];
          summary: string;
          recommendations: string[];
        };
      } catch {
        return {
          techStack: githubData.languages,
          frameworks: [],
          architecture: "Could not determine architecture",
          testingSetup: "Unknown",
          ciSetup: githubData.rootFiles.some((f) => f.includes(".github") || f.includes(".ci")),
          dockerized: githubData.rootFiles.includes("Dockerfile"),
          conventions: [],
          reviewChecklist: [],
          summary: "Repository uses " + githubData.languages.join(", ") + ".",
          recommendations: [],
        };
      }
    });

    // Save analysis to repository metadata
    await step.run("save-analysis", async () => {
      return db.repository.update({
        where: { id: repositoryId },
        data: {
          metadata: {
            ...analysis,
            analyzedAt: new Date().toISOString(),
          },
        },
      });
    });

    return { success: true, repositoryId, analysis };
  }
);
