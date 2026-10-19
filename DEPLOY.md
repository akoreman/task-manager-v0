# Deploy to AWS

This branch uses [AWS Blocks](https://docs.aws.amazon.com/blocks/) to deploy your app. The `aws-blocks/` directory contains the infrastructure definition. Follow these steps to deploy it to your AWS account.

## 1. Prerequisites

Verify the following tools are installed:

- **Node.js** >= 22 (`node --version`)
- **AWS CLI** v2 (`aws --version`) — v2.22+ recommended for the simplest login flow
- **AWS CDK CLI** (`npx cdk --version`, or install globally: `npm install -g aws-cdk`)
- **pnpm** (this app uses it): must be on your PATH for the whole deploy — the CDK Lambda bundler invokes `pnpm` by name while bundling, so a one-off `npx pnpm` isn't enough. Enable it with `corepack enable` (ships with Node), then verify `pnpm --version`.

If any are missing, install them before proceeding.

## 2. AWS Authentication

First, check whether the deployment profile is already authenticated:

```sh
aws sts get-caller-identity --profile aws-migrate
```

If this succeeds, confirm the returned account and identity with the user, then skip to setting the profile for this session below.

If the CLI reports `Unable to locate credentials` or that the `aws-migrate` profile could not be found, present both choices to the user:

- **Don't have an AWS account?** → [Sign up for AWS (new)](https://signin.aws.amazon.com/signup?request_type=builderId). Wait for the user to complete account creation, then sign in below.
- **Have one?** → Run `aws login --profile aws-migrate --region us-east-1` as shown below.

Missing local credentials do not mean the user lacks an AWS account. If existing credentials are expired or invalid, sign in again to the existing account; do not suggest creating another account. For other errors (such as access denied, connectivity, or endpoint failures), stop and diagnose the error rather than treating it as missing credentials.

### Sign in when needed

Accounts created through the new sign-up experience have their Region set in [AWS project settings](https://settings.aws.com/projects). If that Region isn't `us-east-1`, use it in place of `us-east-1` in the commands below.

```sh
aws login --profile aws-migrate --region us-east-1
```

This opens a browser window. Sign in using your AWS Management Console credentials and select the identity you want to use for deployment.

<details>
<summary>If <code>aws login</code> is not recognized</summary>

**Option A — SSO login (AWS CLI 2.0+):**

```sh
aws configure sso --profile aws-migrate
# When prompted: start URL = your org's SSO URL, region = us-east-1
aws sso login --profile aws-migrate
```

**Option B — IAM access keys (any version):**

```sh
aws configure --profile aws-migrate
```

Enter your Access Key ID, Secret Access Key, and region (`us-east-1`). Create keys in the [IAM console](https://console.aws.amazon.com/iam/home#/security_credentials) if needed.
</details>

After signing in, verify authentication again:

```sh
aws sts get-caller-identity --profile aws-migrate
```

Do not bootstrap or deploy until this succeeds and the user confirms the intended account and identity.

Then set the profile for this session:

```sh
export AWS_PROFILE=aws-migrate
```

### Check the account can deploy

Confirm the account's AWS Organization doesn't block the deployment Region:

```sh
aws cloudformation list-stacks --max-items 1 --query 'StackSummaries[0].StackName'
```

If this fails with `explicit deny in a service control policy`, the organization blocks this Region. More IAM permissions or an admin role cannot fix that. Ask the user for a Region their organization allows (or a different account), run `export AWS_REGION=<region>`, and repeat the check before continuing.

## 3. Bootstrap CDK (first-time only)

If this is your first CDK deployment to this account/region, install dependencies and bootstrap from the project root:

```sh
pnpm install
npx cdk bootstrap
```

If you see "Environment aws://ACCOUNT/REGION is already bootstrapped", skip this step.

## 4. Deploy

Install dependencies and deploy from the project root:

```sh
pnpm install

# Interactive — prompts for approval on IAM changes:
npx cdk deploy --all --require-approval broadening --progress events

# Unattended (CI or an agent) — the approval prompt hangs without a TTY:
npx cdk deploy --all --require-approval never --progress events
```

`cdk deploy` builds the frontend (`pnpm build` → `.next/`) and uploads the output to S3 + CloudFront automatically. Do **not** run `aws s3 sync` afterwards — the Hosting construct handles asset upload and cache invalidation.

## 5. Verify

CDK prints the CloudFront URL when the deploy completes. Open it in a browser — the app should load.

Allow 2-5 minutes for initial CloudFront propagation.

## Teardown (if needed)

To remove all deployed resources, run from the project root:

```sh
npx cdk destroy --all
```

---

## Next Steps

### Set up cost monitoring

We recommend setting up a budget to avoid unexpected AWS charges. If you're using an AI coding assistant with the [AWS Agent Toolkit](https://github.com/aws/agent-toolkit-for-aws), ask it:

> "Help me set up an AWS budget for my deployed app"

The toolkit's **aws-billing-and-cost-management** skill will work with you to determine an appropriate budget amount and create alerts. Without the toolkit, see the [AWS Budgets documentation](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html).

### Harden the CloudFront distribution

Once the deployment completes and the CloudFront distribution exists, consider hardening it for defense in depth. It's public-facing, so it benefits from a WAF WebACL (SQL injection, XSS, bot traffic), a Response Headers Policy (HSTS, CSP, X-Frame-Options, X-Content-Type-Options), ACM certificates for a custom domain, and logging (WAF logs + CloudFront access logs) for monitoring and incident investigation.

If you're using an AI coding assistant, ask it:

> "Harden my CloudFront distribution: attach a WAF WebACL with logging, add a Response Headers Policy with security headers, set up ACM for a custom domain, and enable CloudFront access logs."

These are outside the cost estimate generated earlier and may incur extra charges — see [https://calculator.aws](https://calculator.aws) for pricing. Review and confirm each change before it's applied.

## Troubleshooting

### Authentication fails or credentials expired

Re-run the authentication step from section 2.

### CDK bootstrap error

- "Access Denied": your IAM identity needs CloudFormation, S3, and IAM permissions — use an admin role for first-time setup.
- "explicit deny in a service control policy": your AWS Organization blocks this action or Region; IAM changes won't help. See "Check the account can deploy" in section 2.
- "already bootstrapped": safe to skip.

### Deploy fails part-way

CDK rolls back automatically. Read the error from the CloudFormation events output, fix it, and re-run `npx cdk deploy --all` — it is idempotent.

### "No stacks found" or wrong stack

Run `npx cdk ls` from the project root to list the stacks defined in `aws-blocks/index.cdk.ts`, then deploy with `npx cdk deploy --all`.

### Permission errors during deploy

Your identity needs CloudFormation, S3, CloudFront, Lambda, and IAM permissions. `AdministratorAccess` is the simplest path for a personal account.

### CloudFront returns 403

- Wait 2-5 minutes for distribution propagation
- Re-run `npx cdk deploy --all` to trigger a fresh deployment
- Check that `pnpm build` produces output in the `.next/` directory
