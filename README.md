# Tracr

Mobile app that analyzes sports videos: golf ball flight with a broadcast-style tracer, soccer shot speed with a goal verdict, and a perfected-action replay of your own swing.

Core features:
- **Video upload & recording** — record shots in-app or import existing videos, with slow-motion / high-frame-rate support.
- **Ball detection & tracking** — computer vision identifies the ball at impact, tracks flight frame-by-frame, and renders a broadcast-style tracer line overlay.
- **Distance estimation** — carry and total distance in yards, calibrated from club selection, camera angle, and known reference objects (tee markers, flags, range targets).
- **Session history** — every analyzed shot is saved on-device; results show honest "vs your club average" deltas once enough history exists.

Note: the internal React Native project name remains `GolfTracerAI` (renaming it breaks native project references); the product/display name is Tracr.
