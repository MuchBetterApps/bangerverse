#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Run in your fork's checkout. Google credentials stay with the Firebase CLI.
remote="$(git remote get-url origin)"
if [[ "$remote" == *MuchBetterApps/bangerverse* || "$remote" == *muchbetterapps/bangerverse* || "$remote" == *bangermail/bangerverse* ]]; then
  read -r -p 'Your GitHub fork URL (https://github.com/owner/repo): ' fork_url
  fork_lower="$(printf '%s' "$fork_url" | tr '[:upper:]' '[:lower:]')"
  if [[ ! "$fork_url" =~ ^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/?$ ]] || [[ "$fork_lower" == *bangermail/bangerverse* || "$fork_lower" == *muchbetterapps/bangerverse* ]]; then
    echo 'Enter the HTTPS URL of your own fork.' >&2
    exit 1
  fi
  checkout_dir="$(mktemp -d)"
  git clone --depth 1 "$fork_url" "$checkout_dir/source"
  exec bash "$checkout_dir/source/apps/mailg/scripts/deploy-firebase.sh"
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
