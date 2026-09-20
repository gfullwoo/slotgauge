#!/usr/bin/env bash
# One-time GCP bootstrap for SlotGauge (slotgauge) on Cloud Run with keyless GitHub Actions deploys.
# Usage: PROJECT_ID=slotgauge-prod BILLING_ACCOUNT=XXXXXX-XXXXXX-XXXXXX ./infra/setup-gcp.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-slotgauge}"
BILLING_ACCOUNT="${BILLING_ACCOUNT:?set BILLING_ACCOUNT (gcloud billing accounts list)}"
REGION="${REGION:-us-east4}"            # Northern Virginia: closest region to Delaware
GITHUB_REPO="${GITHUB_REPO:-gfullwoo/slotgauge}"
SERVICE="slotgauge"
AR_REPO="slotgauge"
SA_NAME="github-deploy"
POOL="github"
PROVIDER="github-oidc"

echo "== project"
if ! gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud projects create "$PROJECT_ID" --name="SlotGauge"
fi
gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT"
gcloud config set project "$PROJECT_ID"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"

echo "== APIs"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com iam.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com cloudbuild.googleapis.com

echo "== Artifact Registry"
gcloud artifacts repositories describe "$AR_REPO" --location="$REGION" >/dev/null 2>&1 || \
  gcloud artifacts repositories create "$AR_REPO" --repository-format=docker --location="$REGION" --description="SlotGauge images"
# keep only recent images
gcloud artifacts repositories set-cleanup-policies "$AR_REPO" --location="$REGION" --policy=/dev/stdin <<'JSON' || true
[{"name":"keep-recent","action":{"type":"Keep"},"mostRecentVersions":{"keepCount":10}},
 {"name":"delete-old","action":{"type":"Delete"},"condition":{"olderThan":"30d"}}]
JSON

echo "== deploy service account"
SA="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"
gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 || \
  gcloud iam service-accounts create "$SA_NAME" --display-name="GitHub Actions deployer"
for role in roles/run.admin roles/artifactregistry.writer roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA" --role="$role" --condition=None >/dev/null
done
# runtime identity for the Cloud Run service (least privilege: nothing beyond defaults)
gcloud iam service-accounts describe "slotgauge-run@$PROJECT_ID.iam.gserviceaccount.com" >/dev/null 2>&1 || \
  gcloud iam service-accounts create slotgauge-run --display-name="SlotGauge Cloud Run runtime"
gcloud iam service-accounts add-iam-policy-binding "slotgauge-run@$PROJECT_ID.iam.gserviceaccount.com" \
  --member="serviceAccount:$SA" --role="roles/iam.serviceAccountUser" >/dev/null

echo "== Workload Identity Federation (keyless GitHub -> GCP)"
gcloud iam workload-identity-pools describe "$POOL" --location=global >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools create "$POOL" --location=global --display-name="GitHub Actions"
gcloud iam workload-identity-pools providers describe "$PROVIDER" --location=global --workload-identity-pool="$POOL" >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
    --location=global --workload-identity-pool="$POOL" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition="assertion.repository == '$GITHUB_REPO'"
gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository/$GITHUB_REPO" >/dev/null

WIF_PROVIDER="projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER"

cat <<EOT

== Done. Add these as GitHub *repository variables* (Settings -> Secrets and variables -> Actions -> Variables):
  GCP_PROJECT_ID    = $PROJECT_ID
  GCP_REGION        = $REGION
  GCP_WIF_PROVIDER  = $WIF_PROVIDER
  GCP_DEPLOY_SA     = $SA

Or with the GitHub CLI:
  gh variable set GCP_PROJECT_ID   -R $GITHUB_REPO -b "$PROJECT_ID"
  gh variable set GCP_REGION       -R $GITHUB_REPO -b "$REGION"
  gh variable set GCP_WIF_PROVIDER -R $GITHUB_REPO -b "$WIF_PROVIDER"
  gh variable set GCP_DEPLOY_SA    -R $GITHUB_REPO -b "$SA"

Then push to main (or run the "Deploy to Cloud Run" workflow). After the first deploy, map your domain:
  gcloud beta run domain-mappings create --service $SERVICE --domain slotgauge.com --region $REGION
  gcloud beta run domain-mappings create --service $SERVICE --domain www.slotgauge.com --region $REGION
and add the DNS records it prints at your registrar (A/AAAA for the apex, CNAME ghs.googlehosted.com for www).
EOT
