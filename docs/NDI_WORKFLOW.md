# NDI Workflow

LiveLayer does not emit native NDI. The near-term supported workflow is to render
graphics in OBS first, then send the finished OBS scene or source over NDI.

## Recommended bridge

Use a graphics PC as the renderer:

1. Run LiveLayer on the graphics PC.
2. Open OBS on the graphics PC.
3. Add `http://127.0.0.1:4173/output` as a transparent Browser Source.
4. Place the Browser Source above the camera, video, or program background.
5. Install and configure an OBS NDI workflow such as DistroAV/NDI.
6. Enable NDI output for the scene/program that includes the LiveLayer overlay.
7. On the receiving PC or Mac, add the NDI source in OBS or another
   NDI-compatible application.

This sends rendered video. It does not sync LiveLayer's local browser data to the
receiving machine.

## Control options

- Same machine: control from the graphics PC at `http://127.0.0.1:4173/control`.
- Beta remote control: run `npm run lan:relay` on the graphics PC and use the
  `/setup` LAN URLs for `/control` and `/output`.

The LAN relay carries live commands only. Uploaded assets, People, Saved
Graphics, and rundowns remain browser-local until host-owned storage is built.

## Why not native NDI yet

Native NDI output would require a different runtime shape than the current
browser-first app:

- desktop wrapper or native process
- NDI SDK integration and licensing review
- frame capture/compositing pipeline
- macOS and Windows packaging
- latency, alpha-channel, and GPU performance testing
- crash recovery outside the browser

That is a later native-app phase. The current product should keep the OBS
Browser Source path simple, transparent, and reliable.

## QA checklist

- `/output` is transparent over camera/video in OBS.
- NDI receiver shows the full OBS scene/program with the overlay.
- Take and Clear update on the graphics PC before checking the receiving PC.
- Refreshing the OBS Browser Source recovers the last live graphic.
- The receiver is treated as video output, not a LiveLayer state store.
