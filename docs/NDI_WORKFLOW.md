# NDI Workflow

Native NDI output is not part of this sprint. The safe near-term workflow is to
use OBS as the renderer and DistroAV as the NDI bridge.

LiveLayer should continue to render transparent graphics through `/output`.
OBS already knows how to composite that Browser Source, and DistroAV can send
the composed source or scene over NDI to another production machine.

## Recommended Near-Term Setup

Graphics PC:

1. Run LiveLayer.
2. Open `/control` locally or from another device.
3. Add `http://127.0.0.1:4173/output` or the LAN host URL as an OBS Browser
   Source.
4. Keep the Browser Source at `1920x1080` with transparency enabled.
5. Install OBS + DistroAV.
6. Send the LiveLayer source or scene over NDI.

Main OBS PC:

1. Install OBS + DistroAV.
2. Add an NDI Source.
3. Select the Graphics PC's LiveLayer scene/source.
4. Composite it over camera, slides, or program video.

This gives the production team NDI routing without changing LiveLayer's live
message contract or requiring native video output.

## Why This Comes Before Native NDI

OBS already solves:

- browser rendering
- alpha compositing
- source transforms
- scene routing
- NDI output through DistroAV
- production monitoring

Building native NDI into LiveLayer would require a different runtime profile,
likely a desktop wrapper or native helper, plus platform-specific packaging and
NDI SDK licensing decisions. That is a later phase.

## Native NDI Future Phase

Native NDI would require:

- a native app shell or helper process
- direct frame rendering or offscreen browser capture
- alpha channel preservation
- frame timing controls
- audio/video clock considerations if animation timing matters
- NDI SDK packaging and licensing review
- Windows/macOS install and permissions testing

Native NDI should be considered only after LAN host mode and OBS/DistroAV
workflow are proven in real services.

## QA Checklist

- `/output` stays transparent in OBS.
- DistroAV sends the graphic with alpha preserved where supported.
- Main OBS PC receives the NDI source with acceptable latency.
- Take/Clear from `/control` updates the Graphics PC OBS scene.
- Refreshing the Browser Source restores the live graphic.
- The workflow works without internet access once dependencies are installed.

