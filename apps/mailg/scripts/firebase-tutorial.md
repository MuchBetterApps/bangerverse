# Deploy your mailG fork to Firebase

## Deploy

This publishes the static app to Firebase Hosting. It does not use App Hosting, Cloud Functions, Redis, or app secrets.

Run in the terminal:

```sh
npm run deploy:firebase
```

The script builds your fork, asks you to sign in to Google, lists your Firebase projects, and deploys to the project ID you choose. For a first project, create one on the Spark plan in [Firebase Console](https://console.firebase.google.com), then enter its ID. Hosting's free quota applies; no billing account is needed for this static site on Spark.

## Open your app

Open the Hosting URL printed by the command. Choose **Try demo** or **Sign in with Banger**. No OAuth client ID, app key, database, or session store is needed.

Banger must have its browser OAuth support deployed before live sign-in works. Demo mode works independently.

Changes to your fork are deployed by running the script again; this launcher does not set up continuous deployment.
