# Princess VRM base

`princess-base.vrm` is the unmodified `VRM1_Constraint_Twist_Sample.vrm` from pixiv/three-vrm's official expressions example. Costume replacement, body masking and material adjustments happen at runtime in both the game and the appearance preview; this asset is not an original model created for this game.

- Author: pixiv Inc.; copyright (c) 2022 pixiv Inc.
- Model version: v1.0.1
- Source: https://github.com/pixiv/three-vrm/blob/release/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm
- License: https://vrm.dev/licenses/1.0/
- Embedded permissions: `avatarPermission: everyone`, `commercialUsage: corporation`, `allowRedistribution: true`, `modification: allowModificationRedistribution`, `creditNotation: unnecessary`.
- SHA-256: `12c2b97e95e700783a6a550dc0eee2d7880aeedccef9ae67bc4c5a2f0f2631a2`

The complete license metadata is retained inside the VRM file. The three-vrm library is licensed under MIT, independently of the model license.

Upstream implementation references:
- https://github.com/pixiv/three-vrm/blob/release/packages/three-vrm/examples/expressions.html
- https://github.com/pixiv/three-vrm/blob/release/packages/three-vrm-core/src/expressions/VRMExpressionManager.ts

The game loads this model locally through `VRMLoaderPlugin`, drives expressions through `VRMExpressionManager`, and updates the humanoid and spring bones with `vrm.update()`. The six authored garment styles share an immutable bind pose on the model's normalized skeleton. `/princess-preview.html` provides front and three-quarter views of the same character.
