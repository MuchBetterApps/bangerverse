#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Run in your fork's checkout. Google credentials stay with the Firebase CLI.
remote="$(git remote get-url origin)"
if [[ "$remote" == *MuchBetterApps/bangerverse* || "$remote" == *muchbetterapps/bangerverse* || "$remote" == *bangermail/bangerverse* ]]; then
  echo 'Fork Bangerverse and run this from your fork first.' >&2
  exit 1
fi
npm ci
npm run build
npx --yes firebase-tools login --no-localhost
printf '\nChoose an existing Firebase project (or create a Spark project at https://console.firebase.google.com).\n'
npx --yes firebase-tools projects:list
read -r -p 'Firebase project ID: ' project_id
if [[ ! "$project_id" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]]; then
  echo 'Invalid Firebase project ID.' >&2
  exit 1
fi
npx --yes firebase-tools deploy --only hosting --project "$project_id"
