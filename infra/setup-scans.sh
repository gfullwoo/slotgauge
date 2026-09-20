#!/usr/bin/env bash
# Second-stage bootstrap for photo identification + user galleries:
# Firestore, a private photo bucket, the Anthropic key in Secret Manager, IAM for the runtime SA,
# and the Firebase project + Google sign-in provider (Firebase parts need the Firebase CLI).
# Usage: ANTHROPIC_API_KEY=sk-ant-... ./infra/setup-scans.sh
set -euo pipefail
PROJECT_ID="${PROJECT_ID:-slotgauge}"
REGION="${REGION:-us-east4}"
BUCKET="${BUCKET:-${PROJECT_ID}-scans}"
RUN_SA="slotgauge-run@${PROJECT_ID}.iam.gserviceaccount.com"
GITHUB_REPO="${GITHUB_REPO:-gfullwoo/slotgauge}"
gcloud config set project "$PROJECT_ID" >/dev/null

echo "== APIs"
gcloud services enable firestore.googleapis.com storage.googleapis.com secretmanager.googleapis.com \
  identitytoolkit.googleapis.com firebase.googleapis.com iamcredentials.googleapis.com

echo "== Firestore (native mode)"
gcloud firestore databases describe --database='(default)' >/dev/null 2>&1 || \
  gcloud firestore databases create --database='(default)' --location="$REGION" --type=firestore-native

echo "== Photo bucket (private; app serves signed URLs)"
gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1 || \
  gcloud storage buckets create "gs://$BUCKET" --location="$REGION" --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update "gs://$BUCKET" --lifecycle-file=/dev/stdin <<'JSON' >/dev/null
{"rule":[{"action":{"type":"AbortIncompleteMultipartUpload"},"condition":{"age":1}}]}
JSON

echo "== Anthropic key -> Secret Manager"
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  if gcloud secrets describe anthropic-api-key >/dev/null 2>&1; then
    printf '%s' "$ANTHROPIC_API_KEY" | gcloud secrets versions add anthropic-api-key --data-file=- >/dev/null
  else
    printf '%s' "$ANTHROPIC_API_KEY" | gcloud secrets create anthropic-api-key --data-file=- --replication-policy=automatic >/dev/null
  fi
else
  echo "   (ANTHROPIC_API_KEY not set - skipping; add it later with: printf '%s' KEY | gcloud secrets create anthropic-api-key --data-file=-)"
fi

echo "== Runtime service account permissions"
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$RUN_SA" --role="roles/datastore.user" --condition=None >/dev/null
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$RUN_SA" --role="roles/storage.objectAdmin" >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$RUN_SA" --role="roles/iam.serviceAccountTokenCreator" --condition=None >/dev/null   # signed URLs without a key file
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$RUN_SA" --role="roles/firebaseauth.viewer" --condition=None >/dev/null
gcloud secrets add-iam-policy-binding anthropic-api-key --member="serviceAccount:$RUN_SA" --role="roles/secretmanager.secretAccessor" >/dev/null 2>&1 || true

echo "== Firebase"
if command -v firebase >/dev/null; then
  firebase projects:addfirebase "$PROJECT_ID" >/dev/null 2>&1 || true
  APP_JSON="$(firebase apps:list WEB --project "$PROJECT_ID" --json 2>/dev/null || echo '{}')"
  if ! echo "$APP_JSON" | grep -q '"appId"'; then firebase apps:create WEB SlotGauge --project "$PROJECT_ID" >/dev/null; fi
  firebase apps:sdkconfig WEB --project "$PROJECT_ID" 2>/dev/null | sed -n 's/.*"apiKey": *"\([^"]*\)".*/FIREBASE_API_KEY=\1/p'
else
  echo "   Firebase CLI not installed (npm i -g firebase-tools). Do these in the console instead:"
fi

cat <<EOT

== Remaining manual steps (Firebase console: https://console.firebase.google.com/project/$PROJECT_ID)
  1. Build -> Authentication -> Get started -> Sign-in method -> Google -> Enable (pick a support email) -> Save.
  2. Authentication -> Settings -> Authorized domains -> add: slotgauge.com and www.slotgauge.com
  3. Project settings -> General -> Your apps -> Web app "SlotGauge" -> copy the apiKey.

== GitHub repository variables to add (Settings -> Secrets and variables -> Actions -> Variables)
  FIREBASE_API_KEY    = <apiKey from step 3>
  FIREBASE_AUTH_DOMAIN= slotgauge.com          (the app proxies /__/auth/* to Firebase; keeps sign-in first-party)
  SCANS_BUCKET        = $BUCKET
  gh variable set FIREBASE_API_KEY     -R $GITHUB_REPO -b "<apiKey>"
  gh variable set FIREBASE_AUTH_DOMAIN -R $GITHUB_REPO -b "slotgauge.com"
  gh variable set SCANS_BUCKET         -R $GITHUB_REPO -b "$BUCKET"

Then push to main. /api/health will report identify:true and scans:true when everything is wired.
EOT
