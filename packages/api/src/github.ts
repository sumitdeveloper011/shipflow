import { App, Octokit } from "@octokit/app";
import { createPrivateKey } from "crypto";

/**
 * GitHub generates private keys in PKCS#1 format ("BEGIN RSA PRIVATE KEY").
 * The universal-github-app-jwt library requires PKCS#8 ("BEGIN PRIVATE KEY").
 * This function auto-converts PKCS#1 → PKCS#8 using Node's built-in crypto.
 */
function normalizePem(raw: string): string {
  const pem = raw.replace(/\\n/g, "\n");
  if (pem.includes("BEGIN PRIVATE KEY")) return pem; // already PKCS#8
  try {
    return createPrivateKey(pem).export({ type: "pkcs8", format: "pem" }) as string;
  } catch (e) {
    console.warn("[github] Could not convert private key to PKCS#8:", (e as Error).message);
    return pem;
  }
}

// GitHub App is optional — only initialized when env vars are set
function createGithubApp() {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const webhookSecret = process.env.GITHUB_APP_WEBHOOK_SECRET;
  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;

  if (!appId || !privateKey || !clientId || !clientSecret) {
    return null;
  }

  try {
    return new App({
      appId,
      privateKey: normalizePem(privateKey),
      webhooks: { secret: webhookSecret || "dev-secret" },
      oauth: { clientId, clientSecret },
    });
  } catch (e) {
    console.warn("GitHub App initialization failed — GitHub features disabled:", (e as Error).message);
    return null;
  }
}

export const githubApp = createGithubApp();

export async function getOctokitForInstallation(installationId: number): Promise<Octokit> {
  if (!githubApp) throw new Error("GitHub App not configured");
  return githubApp.getInstallationOctokit(installationId) as unknown as Octokit;
}

export async function getPRDiff(
  installationId: number,
  owner: string,
  repo: string,
  pullNumber: number
) {
  const octokit = await getOctokitForInstallation(installationId);

  const [prData, filesData] = await Promise.all([
    octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
      owner,
      repo,
      pull_number: pullNumber,
    }),
    octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}/files", {
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
    }),
  ]);

  return {
    pr: prData.data,
    files: filesData.data.map((f: {
      filename: string;
      status: string;
      additions: number;
      deletions: number;
      patch?: string;
    }) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch,
    })),
  };
}

export async function postReviewComment(
  installationId: number,
  owner: string,
  repo: string,
  pullNumber: number,
  body: string
) {
  try {
    const octokit = await getOctokitForInstallation(installationId);
    await octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/comments", {
      owner,
      repo,
      issue_number: pullNumber,
      body,
    });
  } catch (err) {
    console.error("Failed to post GitHub review comment:", err);
    // Non-fatal — don't fail the whole review if comment posting fails
  }
}

export async function getOpenPRsForRepo(
  installationId: number,
  owner: string,
  repo: string
) {
  const octokit = await getOctokitForInstallation(installationId);
  const { data } = await octokit.request("GET /repos/{owner}/{repo}/pulls", {
    owner,
    repo,
    state: "open",
    per_page: 50,
  });
  return data.map((pr) => ({
    number: pr.number,
    title: pr.title,
    headBranch: pr.head.ref,
    baseBranch: pr.base.ref,
    htmlUrl: pr.html_url,
    authorLogin: pr.user?.login ?? "unknown",
    githubPrId: pr.id,
  }));
}
