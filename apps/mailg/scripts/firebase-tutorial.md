# Deploy your mailG fork to Firebase

## Choose your fork

[Create your fork](https://github.com/bangermail/bangerverse/fork), then run:

```sh
npm run deploy:firebase
```

Paste your fork's HTTPS repository URL when prompted. The script clones your fork and builds its mailG app.

## Publish

Sign in to Firebase and choose the project ID to deploy to. For a first project, create one using Hosting on Spark in Firebase Console, then enter its ID.

## Open your app

Open the Hosting URL printed by the command. Choose **Try demo** or **Sign in with Banger**. Live sign-in requires Banger's browser OAuth support to be deployed.

Run the script from an updated checkout of your fork to publish future changes.
