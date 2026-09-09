# Deploy Secret Hitler with GitHub Actions

The workflow `.github/workflows/tests.yml` tests every push and pull request. Only a successful run on `main` may deploy production. You can also run **Test and deploy → Run workflow** manually on `main`. Pull requests and other branches never get production credentials or deploy production.

## One-time setup for a new Vercel project

1. Sign in to [Vercel](https://vercel.com/new) and create a Next.js project named **secret-hitler-table**. Select `Salman-Shaik/secret_hitler` if importing the repository. Alternatively, use `npx vercel link` in this repository to create/link a project through the CLI. Follow the Vercel login prompts locally; never commit or send an access token in chat.
2. Set these **Production** environment variables in the Vercel project's **Settings → Environment Variables**, using an Upstash Redis database:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
3. Create a Vercel access token at [Vercel account tokens](https://vercel.com/account/settings/tokens), scoped to the account/team owning the new project.
4. Get the project ID from Vercel **Project Settings → General**. Get the owning account/team ID from Vercel settings, or run `npx vercel link` and use `orgId` and `projectId` in the generated `.vercel/project.json`.
5. In [GitHub Actions secrets for this repository](https://github.com/Salman-Shaik/secret_hitler/settings/secrets/actions), add:

   | Secret              | Value                            |
   | ------------------- | -------------------------------- |
   | `VERCEL_TOKEN`      | Vercel access token              |
   | `VERCEL_ORG_ID`     | Owning account/team ID (`orgId`) |
   | `VERCEL_PROJECT_ID` | New project's ID (`projectId`)   |

6. This repository sets `git.deploymentEnabled: false` in `vercel.json` to disable independent Vercel Git deployments. Actions deploys through the CLI after testing. You can also disconnect the repository in **Vercel Project Settings → Git** if you do not want the Git integration connected at all; it does not affect GitHub Actions.
7. Open [GitHub Actions](https://github.com/Salman-Shaik/secret_hitler/actions), select **Test and deploy**, and run it on `main`. Subsequent pushes to `main` run the same pipeline automatically.

The initial Vercel import may create a deployment before the integration is disconnected. If you want the very first deployment to come exclusively from Actions, create/link the project through `npx vercel link` instead of importing it via Git.

## What the workflow does

1. Installs the locked dependencies on Node.js 22.
2. Enforces 100% application code coverage.
3. Builds a separate test app and runs the production browser/API E2E suite, including complete games.
4. Starts a fresh deployment job only if tests pass.
5. Pulls Vercel production settings, runs `vercel build --prod`, and uploads the build with `vercel deploy --prebuilt --prod`.
6. Publishes the deployment URL in the workflow summary and its `production` environment.

Test reports are retained even if tests fail. Deployments are serialized to avoid older runs racing newer ones. Missing deployment secrets deliberately stop the deployment job with named errors; they do not prevent tests from running. The workflow never exposes Vercel secrets to PR tests.

Do not add `NEXT_DIST_DIR`, `TEST_PORT`, `TEST_REDIS_PORT`, or the test double's credentials to Vercel. `.vercel/` and all real `.env` files are ignored by Git. Redis credentials belong in Vercel; the workflow receives them through `vercel pull`, not through committed source or test reports.

## License before publishing

This digital table retains the Secret Hitler name and uses an original favicon. It is an unofficial adaptation intended for noncommercial play with friends. Keep the creator attribution, unofficial notice, and **CC BY-NC-SA 4.0** license. See [LICENSE.md](../LICENSE.md).

Workflow reference: [Vercel's official GitHub Actions guide](https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel).
