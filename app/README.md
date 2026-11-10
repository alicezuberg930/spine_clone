# Image Layer Separator desktop app

An Electron application built with React and TypeScript.

## Spine feature and edition reference

This section records the feature set of [Spine](https://en.esotericsoftware.com/), Esoteric Software's 2D skeletal-animation editor and runtime system. It is intended as a product reference for this project.

The comparison was checked against the official Spine website on **2026-11-10**. Spine calls its free version the **Trial**; it is an evaluation build, not a separate perpetual free license. Prices, licensing, and features can change, so confirm purchasing decisions on the [official purchase page](https://en.esotericsoftware.com/spine-purchase).

### Edition summary

| Edition | Intended use | Main limitation |
| --- | --- | --- |
| Free Trial | Evaluate the complete basic and advanced animation workflow on Windows, macOS, or Linux. | Projects can be opened and imported, but not saved. Data, images, video, and texture atlases cannot be exported. A Trial is not a license to ship the Spine Runtimes. |
| Essential | Create, save, and export projects using Spine's basic feature set. Includes export to every supported format and a license to use the Spine Runtimes. | Excludes advanced mesh, deformation, clipping, physics, transform/path constraint, audio, and related workflows. It cannot save or export a project that contains Professional-only data. |
| Professional | Production edition for advanced character rigging and animation. Includes the complete editor feature set and a license to use the Spine Runtimes. | No editor feature restrictions. The normal named-user license is unavailable to businesses at or above Spine's stated Enterprise revenue/financing threshold. |

Essential and Professional are named-user licenses. The official site currently describes both as one-time purchases with future updates included. Businesses with at least **$500,000 USD** in annual revenue, investment income, venture capital, or other financing must use Spine Enterprise instead.

### Complete official feature matrix

This table reproduces every capability in Spine's published Trial/Essential/Professional comparison. “Limited” means the capability works only when the project does not contain Professional-only features.

**LayerForge checklist:** ✅ means the core workflow is implemented as an interactive prototype. ❌ means it is not implemented end-to-end; a visual preview, disabled action, or placeholder UI may still be present.

| Feature | Free Trial | Essential | Professional | LayerForge | Description |
| --- | :---: | :---: | :---: | :---: | --- |
| Physics constraint | Yes | No | Yes | ✅ | Simulates dynamic secondary motion on bones, including inertia, strength, damping, mass, wind, and gravity. Useful for hair, clothing, tails, and other elements that should react automatically. |
| Meshes | Yes | No | Yes | ❌ | Replaces a rectangular image region with a custom polygon. This can avoid drawing transparent pixels and provides geometry for deformation and weighting. |
| Deformation | Yes | No | Yes | ❌ | Keys individual mesh vertices so artwork can bend, squash, stretch, and change shape without requiring a new source image for every frame. Also known historically as free-form deformation or FFD. |
| Weights | Yes | No | Yes | ❌ | Binds each mesh vertex to one or more bones. Moving the bones then deforms the image automatically according to the vertex weights. |
| Clipping | Yes | No | Yes | ❌ | Uses a polygon to restrict where selected attachments are drawn. Spine 4.3 also supports inverse clipping. |
| IK constraint | Yes | Yes | Yes | ❌ | Uses inverse kinematics to rotate a chain of bones toward a target, making limbs and grounded feet easier to pose. The current purchase matrix marks IK as available in Essential. |
| Transform constraint | Yes | No | Yes | ❌ | Maps or copies rotation, translation, scale, or shear from one bone to other bones for automated and reusable rig behavior. |
| Path constraint | Yes | No | Yes | ❌ | Makes bones follow a Bezier path and optionally controls their spacing, rotation, and scale along that path. |
| Audio | Yes | No | Yes | ❌ | Synchronizes MP3, OGG, or WAV audio with an animation for timing, dialogue, or lip-sync work. |
| Open Project | Yes | Limited | Yes | ❌ | Opens an existing Spine project. Essential can inspect projects containing Professional data, but cannot save or export them while that unsupported data remains. |
| Save Project | No | Limited | Yes | ❌ | Writes the editable Spine project. Essential can save only Essential-compatible projects. |
| Export Data | No | Limited | Yes | ❌ | Exports skeleton and animation data in Spine JSON or compact binary format. Essential can export only Essential-compatible projects. |
| Export Images | No | Limited | Yes | ❌ | Exports a still image or animation as GIF, JPEG, or PNG/image sequences. Essential can export only Essential-compatible projects. |
| Export Video | No | Limited | Yes | ❌ | Exports animations as AVI or QuickTime video. Essential can export only Essential-compatible projects. |
| Texture Packer | No | Yes | Yes | ❌ | Packs source images into a texture atlas for efficient runtime rendering or into a spritesheet for conventional sprite animation. Features include whitespace stripping, rotation, and scaling. |
| Import Data | Yes | Yes | Yes | ❌ | Imports compatible Spine JSON or binary skeleton/animation data, including data produced by external tools that implement Spine's documented formats. |
| Import Project | Yes | Yes | Yes | ❌ | Merges content from another Spine project into the current project. |
| Ghosting | Yes | Yes | Yes | ✅ | Draws frames before and after the current frame so arcs, spacing, and animation flow can be evaluated without repeatedly scrubbing playback. |
| Auto Key | Yes | Yes | Yes | ✅ | Automatically creates keys when the skeleton pose changes in Animate mode. |
| Bounding boxes | Yes | Yes | Yes | ❌ | Attaches polygonal metadata to bones for runtime hit detection, physics integration, UI regions, and other application-defined uses. |
| Skins | Yes | Yes | Yes | ✅ | Organizes alternative attachment sets so one skeleton and its animations can drive different characters, outfits, weapons, or visual variants. Advanced skin bones and skin constraints depend on Professional-only rigging features. |
| Graph | Yes | Yes | Yes | ✅ | Edits stepped, linear, and Bezier interpolation curves between keys for precise control over acceleration, overshoot, easing, and motion quality. |
| Dopesheet | Yes | Yes | Yes | ✅ | Displays animation timelines and keys together for timing edits, copying, scaling, and retiming. |
| Bone/Image Compensation | Yes | Yes | Yes | ❌ | Keeps selected child bones or images visually in place while their parent is transformed, making rig setup and correction easier. |
| Posing | Yes | Yes | Yes | ❌ | Provides the Pose tool for quickly positioning a skeleton using temporary multi-bone IK-style manipulation. This is distinct from storing an IK constraint in the rig. |

#### Matrix caveats

- The official purchase matrix currently marks **IK constraint** as available in Essential. Some individual Spine user-guide pages still say that constraints or IK are unavailable in Essential, so the purchase matrix is treated here as the current edition authority.
- Essential may open a project containing Professional-only items, but it must remove or avoid those items before saving or exporting.
- Trial provides the creation and inspection features needed for evaluation, including Professional-only rigging tools, but disables all durable output: save, data export, image export, video export, and texture packing.
- Purchasing Essential or Professional grants runtime usage rights subject to the [Spine Editor License Agreement](https://esotericsoftware.com/spine-editor-license) and [Spine Runtimes License](https://esotericsoftware.com/spine-runtimes-license). This document is a product summary, not legal advice.

### Core Spine workflow

Spine's workflow is based on attaching artwork to bones instead of redrawing the entire character for every frame:

1. Prepare separate artwork pieces, commonly as individual PNG files or layers in a PSD.
2. Import the artwork and arrange attachments, slots, and draw order.
3. Build a bone hierarchy and, in Professional, add meshes, weights, and advanced constraints.
4. Animate bone transforms, attachment changes, colors, draw order, deformation, and constraint properties on the dopesheet and graph.
5. Preview animation mixing and layered playback as it will behave at runtime.
6. Export skeleton data plus a texture atlas, or render conventional images/video.
7. Load, mix, and manipulate the result in an application through a Spine Runtime.

This makes Spine complementary to an image-layer-separation tool: layer separation prepares a flattened illustration as movable pieces, while Spine rigs and animates those pieces.

### Artwork, attachments, and reusable characters

- **Bones and attachments:** Images are attached to bones and inherit their transforms.
- **Slots and draw order:** Slots determine which attachment is visible and how artwork is layered. Draw order can be animated.
- **Attachment swapping:** Animations can switch images during playback for facial expressions, mouth shapes, effects, or frame-by-frame sections.
- **Skins:** Multiple visual variants can share a skeleton and animation library.
- **PSD import:** Spine can extract pixel layers from PSD files written by Photoshop, Affinity, Clip Studio Paint, GIMP, Krita, Paint Tool SAI, Photopea, Procreate, and other compatible software. Layer-name tags can automate slots, skins, placeholders, paths, origins, and other import behavior.
- **Blending modes:** Supported PSD pixel-layer workflows include mappings for common modes such as Multiply, Screen, and Additive/Linear Dodge. Photoshop-rendered features such as some layer styles, adjustment layers, and gradient masks may need to be rasterized or converted to smart objects first.
- **Texture atlases:** Packed atlases reduce texture changes at runtime; Spine 4.3 can also create separate atlases per skin.

PSD import is not an automatic semantic layer separator. It consumes layers already present in the PSD and turns them into Spine attachments.

### Animation and rigging tools

- **Setup and Animate modes:** Rig construction is kept separate from animation authoring.
- **Dopesheet and graph editor:** Keys can be precisely timed and their interpolation shaped with curves.
- **Preview and mixing:** Multiple animations can run at the same time, such as running plus shooting, and transitions can be crossfaded before export.
- **Ghosting:** Neighboring frames can be overlaid to inspect arcs and spacing.
- **Events:** Timed event keys can notify runtime code about footsteps, attacks, sounds, or other gameplay moments.
- **Mesh deformation and weights:** Professional can bend artwork smoothly with a relatively small number of source images.
- **IK, transform, path, and physics systems:** Constraints automate complex posing, mechanical relationships, path following, and secondary motion according to edition availability in the matrix.
- **Sliders in Spine 4.3:** Professional can apply a selected frame of another animation as a reusable pose or blend shape. A slider can be keyed directly or driven by a bone's rotation, translation, scale, or shear. Sliders are available for Trial evaluation but are not available in Essential.
- **Bounding boxes and paths:** Polygonal attachments can carry runtime geometry or guide constrained bones.
- **Clipping:** Professional can create masks and, in 4.3, inverse masks for cutout and reveal effects.
- **Audio synchronization:** Professional can place supported audio on the timeline while animating.
- **Numeric expressions:** Spine 4.3 accepts calculations, constants, and helper functions in numeric fields, including relative operations such as `+=`, `-=`, `*=`, and `/=`.

### Spine 4.3 workflow improvements

Spine 4.3 adds or expands the following capabilities. The edition gates in the main matrix still apply to the underlying feature—for example, mesh improvements require mesh access and inverse clipping requires clipping access.

- Animation-driven and bone-driven sliders for reusable poses and complex rig logic.
- Transform-property mapping, clamping, and local/world-space controls.
- Multi-mesh tracing with improved joint geometry.
- Binding, welding, smoothing, auto-weighting, pruning, and weight painting across multiple meshes.
- A Problems view that collects project warnings, navigates to affected items, and can automatically fix some issues.
- Ready-to-open HTML exports using Spine Player or Spine Web Components.
- Independent draw-order keys for folders and layered draw-order animation tracks.
- Inverse and more efficient clipping options.
- Linked meshes that can reuse geometry and weights across different slots.
- Volume-preserving scaling for squash-and-stretch behavior associated with physics and IK.
- Dopesheet-to-graph synchronization and improved Bezier-handle preservation.
- Baking constrained values into ordinary keys through the Key Constrained action.
- Improved skin merging and filtering.
- Project packaging as a ZIP containing the project and its images.
- Relative export paths for portable projects and team workflows.
- PSD management and resynchronization from the Images node.
- Per-skin texture-atlas packing.
- Faster multithreaded image, video, data, and command-line exports.
- Expanded command-line import/export options for automated production pipelines.

### Export and runtime integration

Paid editions can export:

- Spine JSON or binary skeleton/animation data.
- Texture-atlas metadata and packed texture images.
- GIF, JPEG, PNG stills, and PNG/JPEG image sequences.
- AVI or QuickTime video.
- In Spine 4.3, a ready-to-open HTML player or Web Components page.

Spine Runtimes load the exported data, render it like the editor, blend and layer animations, crossfade between states, swap skins and attachments, fire animation events, and allow bones or constraints to be changed procedurally from game code. Runtime source code is provided to licensed users.

Official toolkit runtimes listed by Esoteric Software include:

- Unity, Unreal Engine, and Godot.
- iOS, Android, and Flutter.
- Phaser, PixiJS, Three.js, Web Canvas, WebGL, Web Player, Web Components, and CanvasKit.
- libGDX, HaxeFlixel/Starling, MonoGame, SDL, SFML, and GLFW/OpenGL.
- Generic C, C++, C#, Haxe, and TypeScript runtimes for custom renderer integration.

Community runtimes also exist for additional engines and frameworks, but their maintenance and support levels vary.

### Sources

- [Spine purchase page and official edition matrix](https://en.esotericsoftware.com/spine-purchase)
- [Spine feature overview](https://en.esotericsoftware.com/spine-in-depth)
- [Spine 4.3 release notes](https://esotericsoftware.com/blog/Spine-4.3-released)
- [Spine Runtimes and supported integrations](https://en.esotericsoftware.com/spine-runtimes)
- [Spine PSD import guide](https://en.esotericsoftware.com/spine-import-psd)
- [Spine sliders guide](https://en.esotericsoftware.com/spine-sliders)
- [Spine physics constraints guide](https://en.esotericsoftware.com/spine-physics-constraints)
