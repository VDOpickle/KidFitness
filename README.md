# StarMoves

A camera-based exercise game for young children (built for ages 3–7). The child copies an animated
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
js/figure.js                stick-figure coach and synthetic poses
models/, vendor/            MediaPipe Pose Landmarker model + runtime (Apache-2.0)
test/engine.test.mjs        runs every detector against its own coach animation
```
