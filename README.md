# KidFit

A camera-based exercise game for young children (built for ages 3–7). Live at https://kidfit.pages.dev. The child copies an animated
coach, the app tracks their body joints through the webcam, and every rep earns 1–5 stars.

Everything runs in the browser on the device. The pose model and its runtime are stored in this
repository, so no video, image, or data is sent anywhere and no internet connection is needed after download.

## Run it on a desktop or laptop

Browsers only allow camera access on `http://localhost` or `https` pages, so the files must be served
(double-clicking `index.html` will not work).

```
node serve.js          # then open http://localhost:8080
```

or, without Node: `python3 -m http.server 8080`.

Use a current Chrome, Edge, or Safari. Add `?sim` to the address (or use "Try demo mode" on the home
screen) to watch the app play itself without a camera.

## What is in it

- **Workouts** (22, rep counting): Frog Squats, Star Jumps, Reach for the Sky, Marching Band, Windy Tree,
  Touch Your Toes, Elbow to Knee, Bunny Hops, Clap the Sky, Side Kicks, Pick Apples, Speedy Feet,
  Flap Your Wings, Show Your Muscles, Plié Bends, Tippy-Toe Rises, Point Your Toes, Ballerina Arms,
  Curtsy, Twirl, Straight Jumps, Side Lunges.
- **Stretches** (18, timed holds): Giraffe Stretch, Rainbow Bend, Rag Doll, Airplane Arms, Starfish,
  Flamingo Stand, Big Bear Hug, Cactus Arms, Sleepy Owl, Invisible Chair, Tree Pose, Rocket Ship,
  Chicken Wings, Giant Steps, Ballerina Crown, Passé Balance, Straddle Reach, Ta-Da Finish.
- **Programs** (10, 10–15 moves each): Ballet Class, Tiny Dancer Warm-Up, Gymnastics Stars, Gym Warm-Up,
  Sunny Morning Wake-Up, Jungle Adventure, Superhero Training, Wiggle Break, Calm Down Stretch,
  Ocean Explorers.
- Player profiles with star totals (saved in the browser's local storage), spoken instructions for
  children who cannot read yet, and sound effects.

The ballet and gymnastics programs only use standing moves the camera can see from the front. Floor
skills (rolls, bridges, cartwheels) are left out on purpose: they cannot be tracked reliably and
should be taught in person.

## Coach voice

The coach speaks with the voices installed on the computer, so how human it sounds depends on which
voices are installed. The app picks the best one it can find (Premium, then Natural, then Enhanced)
and the "Coach voice" menu at the bottom of the home screen lets you choose another and test it.

To get a more natural voice on a Mac: System Settings → Accessibility → Spoken Content → System Voice →
Manage Voices, download an English "Premium" or "Enhanced" voice (for example Ava or Zoe), then quit
and reopen the browser and pick it in the "Coach voice" menu.

## Road Run (game mode)

Pick the **Games** tab. The child's avatar runs down a road and the child steers with their body:

| Body move | In the game |
|---|---|
| Lean left / right | Change lane to dodge rocks, cones and crabs |
| Jump | Hop over hurdles, and grab stars in the air |
| Squat | Duck under high beams |
| Reach up | Pop balloons for stars |

Three levels add moves gradually: Sunny Road (lean, jump), Forest Run (adds squat) and Beach Dash
(adds reach). A hint with a small coach figure shows the next move as an obstacle gets close, and the
voice says it once. There are no lives: bumps cost points on the final rating, not the run. Each star
collected goes to the player's total, and the end screen gives 1–5 stars (60% stars collected, 40% obstacles cleared).

Code: `js/runner.js` (course, rules, pose-to-input mapping, demo player; no DOM) and `js/runnerView.js` (drawing).
The demo mode plays Road Run too; `npm test` plays every level with a bot driven through the same pose pipeline.

## My avatar

The **My avatar** button on the home screen (next to the player names) opens the avatar editor.
Ported from the Kinetra adult app and adapted for children:

- **Photo to avatar:** upload a photo or take one with the camera. The head becomes a circular crop, and shirt,
  trousers, skin and hair colours are sampled from the photo. If no body is found in the picture, only the head is used.
- **No photo needed:** pick shirt, trousers, skin and hair colours to get a cartoon avatar with a face.
- **Where it shows:** on the coach (front and side), on the demo player, and as the runner in Road Run, where the
  colours are used. On the live camera it is not drawn over the child, who sees themselves.
- **Private by design:** the photo and colours live in memory only. They are never saved or uploaded, and clear on reload.
- **Left out on purpose:** the adult app's weight/height body-size setting and its "paste an image link" box.

## Side view

The play screen has two small side-view panels under the coach:

- **Coach · side:** how the coach looks from the side. Seven moves have a side pose drawn for them (squats, chair,
  plié, marching, speedy feet, elbow to knee, flamingo). For every other move the front pose is projected onto the
  side plane, so arms raised out to the side correctly appear as short vertical lines pointing at the camera.
- **You · side:** the child seen from the side, built live from the camera's 3D body points (scaled by torso length, so
  small children fill the panel like adults). In demo mode it shows the demo player.

Depth from a single camera is an estimate, so the live side view is approximate. The panels are hidden on narrow
(phone-portrait) screens.

## How scoring works

Each exercise has a `measure()` function in `js/catalog.js` that turns the tracked joints into a
0–1 "how close to the target pose" value (shown as the POWER bar and the rings around tracked joints).

- **Reps**: the value must rise past 0.5 and come back below 0.25. Stars come from the best value
  reached: 1★ counted, 2★ ≥ 0.60, 3★ ≥ 0.71, 4★ ≥ 0.82, 5★ ≥ 0.93.
- **Holds**: the value must stay above 0.55 until the hold time is banked (a wobble pauses the clock,
  it does not reset it). Stars come from the average value: 2★ ≥ 0.64, 3★ ≥ 0.72, 4★ ≥ 0.80, 5★ ≥ 0.90.

Thresholds live in `js/engine.js`; per-exercise ranges (for example knee angle 160° → 100° for a squat)
live in `js/catalog.js`. Both are meant to be tuned.

## Limits to know about

- One child at a time: the tracker follows a single person in frame.
- The whole body must be visible for leg exercises, which usually means standing 2–3 m from the camera.
- The star thresholds were set by reasoning and by synthetic tests (`npm test`), not by trials with
  children. Expect to adjust them after watching real use.
- This is a game, not a medical or physiotherapy product. An adult should stay nearby.

## Layout

```
index.html, css/app.css     UI
js/app.js                   camera, skeleton overlay, session flow, profiles
js/catalog.js               exercises, programs, and their detectors
js/engine.js                rep/hold tracking and star scoring
js/runner.js, js/runnerView.js   Road Run game (rules + drawing)
js/figure.js                stick-figure coach, side-view figures and synthetic poses
js/avatar.js                avatar from a photo or picked colours, drawing
models/, vendor/            MediaPipe Pose Landmarker model + runtime (Apache-2.0)
test/engine.test.mjs        runs every detector against its own coach animation
test/runner.test.mjs        plays every Road Run level with a bot
test/figure.test.mjs        front and side figures stay in the panel for every exercise
```
