# Deployment

The **Deployment** module connects the app to your Harness CI/CD account so you can browse pipelines, trigger and monitor executions, inspect logs, and use AI assistance to diagnose failures — all without leaving the workspace.

This guide walks you through connecting Harness, then explains each section of the module.

---

## Before you start

You will need:

- A **Harness Personal Access Token (PAT)** with read/write access to the pipelines you intend to use.
  - Generate one in Harness at: **My Profile → API Keys → Create Token**.
- Access to at least one **Organization** and **Project** in your Harness account.

The Account ID is detected automatically from your PAT — you do not need to enter it.

---

## Connecting Harness

Harness credentials are now managed centrally from **My Profile → Integrations**. The Deployment module reads them from there.

### Step 1 — Open the Deployment module

Click **Deployment** in the left sidebar. On first load you will land on the **Settings** section.

You will see a placeholder where the PAT used to be entered, with the message:

> **Connect via My Profile to set your PAT**

The **Connect** button on this screen is disabled by design — credential entry has been moved out of this page.

### Step 2 — Go to My Profile → Integrations

You have two ways to get there:

- Click **Go to My Profile → Integrations** on the Deployment Settings screen, **or**
- Click your avatar in the top-right corner → **My Profile** → **Integrations** section.

### Step 3 — Connect Harness CI/CD

In the Integrations section, find the **Harness CI/CD** card and click **Connect**.

Paste your PAT (format: `pat.<accountId>.<tokenId>.<secret>`) and submit. The app will:

1. Validate the token against Harness.
2. Detect your Account ID automatically.
3. Save the credential to your profile so it persists across sessions.

When successful, the card shows a green **Connected** badge.

### Step 4 — Return to Deployment

Go back to **Deployment → Settings**. The PAT is now picked up automatically, and you can:

- Pick an **Organization** from the dropdown.
- Pick a **Project** from the dropdown.
- Click **Save & Continue**.

The Overview, Pipelines, Deployments, and Logs sections become available.

> You can switch between orgs and projects at any time from the Settings dropdowns — your PAT stays connected at the profile level.

---

## Module sections

The left rail of the Deployment module has six entries:

### Overview

A dashboard snapshot of the connected project:

- Total pipeline count, currently running executions, recent failures.
- **Recent Executions** table — the latest five runs with status, duration, and timestamp.
- **Pipelines** table — the five most recently updated pipelines.

Click any row to jump straight to its **Logs**.

### Pipelines

Browse every pipeline in the selected Harness project. Selecting a pipeline opens three tabs:

- **YAML** — view and edit the pipeline definition. You can ask the AI to make changes in natural language (for example, "add a manual approval step before deploy") and apply the suggested YAML back to Harness.
- **Triggers** — webhook URLs and configured triggers for the pipeline.
- **Input Sets** — runtime variable templates.

### Deployments

A paginated table of pipeline executions for the project, with status badges (Success, Failed, Running, Waiting, Aborted), start time, and duration.

If any execution is running, the table auto-refreshes every few seconds. Click a row to open its **Logs**.

### Logs

The deep-dive view for a single execution.

- Load any execution by ID, or arrive here by clicking a row in Overview or Deployments.
- Failed stages and steps are highlighted with their error messages.
- **Summarize with AI** — turns raw logs into a plain-English summary of what went wrong.
- **Analyze with AI** — root-cause analysis that distinguishes infrastructure issues from application/code issues, and proposes YAML fixes you can apply directly to the pipeline.

### Terraform

A natural-language Terraform generator: describe the infrastructure you need ("an S3 bucket with versioning and a CloudFront distribution in front") and get back a Terraform module you can copy or download.

### Settings

The connection entry point covered above — Org/Project selection and the link out to **My Profile → Integrations** for managing the PAT itself.

---

## Common tasks

| I want to… | Where to go |
|---|---|
| Connect or rotate my Harness PAT | **My Profile → Integrations → Harness CI/CD** |
| Switch to a different Harness Org or Project | Deployment → **Settings** |
| Trigger a pipeline run | Deployment → **Pipelines** → select pipeline → run |
| Check why my last build failed | Deployment → **Deployments** → click the failed row → **Analyze with AI** |
| Edit a pipeline's YAML with AI help | Deployment → **Pipelines** → select pipeline → **YAML** tab |
| Generate Terraform for new infra | Deployment → **Terraform** |

---

## Troubleshooting

**The Settings page says "Connect via My Profile" and I can't enter a PAT.**
This is intentional. PATs are now managed from **My Profile → Integrations**. Use the **Go to My Profile → Integrations** button to get there.

**I connected my PAT in My Profile but Deployment still asks me to connect.**
Refresh the Deployment page. If the Harness CI/CD card on My Profile shows **Connected**, the Deployment Settings page will pick it up.

**Organization or Project dropdown is empty.**
The PAT may not have access to any orgs/projects, or the token is invalid. In **My Profile → Integrations**, click **Reconnect** and paste a fresh PAT with the right scope.

**"Connection failed. Check your PAT token."**
Confirm the PAT format (`pat.<accountId>.<tokenId>.<secret>`) and that it has not expired in Harness. Regenerate at **Harness → My Profile → API Keys** if needed.
