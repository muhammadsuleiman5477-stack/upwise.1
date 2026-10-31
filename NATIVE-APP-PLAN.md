# Turning UPWISE into Android and iOS apps (future plan)

Status: NOT built and NOT tested. UPWISE is currently an installable web app (PWA).
This is a plan for later, using Capacitor (https://capacitorjs.com).

## What you need
- A computer. The Android and iOS builds cannot be made from a phone alone.
- Node.js, plus Android Studio for Android. For iOS you also need a Mac with Xcode.
- A Google Play developer account (one-time fee) and an Apple Developer account (yearly fee).
  Check the current prices before you decide.

## Steps
1. Put the project in a folder on your computer (the same files that are in GitHub).
2. In that folder run:
   - npm init -y
   - npm install @capacitor/core @capacitor/cli
   - npx cap init UPWISE com.yourname.upwise --web-dir=.
   - npm install @capacitor/android @capacitor/ios
   - npx cap add android   (and  npx cap add ios  on a Mac)
3. Open the native project: npx cap open android (or ios), then build and run it on a device.

## Things that will need changes before it works well
- The chat and I'm Stuck pages call /api/chat. Inside a native app the page is not served from your
  website, so those calls must use the full address, for example https://upwise1.vercel.app/api/chat,
  and the server must allow that origin (CORS).
- Login redirect links in Supabase must include the app's address.
- Reminders and push notifications need native plugins and server-side scheduling.
- The service worker is not used inside the native app.
- Both stores have review rules, and apps that collect personal data need a privacy policy link
  and data-use declarations.

## Alternative
Many people keep the PWA. It installs from the browser, updates instantly when you deploy,
and costs nothing extra.
