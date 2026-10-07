import * as T from "three";
import { MToonMaterial } from "@pixiv/three-vrm";

/** Wardrobe colors use the avatar's cel shading instead of reflective PBR. */
export function toon(color: T.ColorRepresentation, name = "anime-cloth") {
  const base = new T.Color(color);
  const material = new MToonMaterial({
    color: base.clone().multiplyScalar(0.76),
    shadeColorFactor: base
      .clone()
      .multiplyScalar(0.35)
      .lerp(new T.Color("#504169"), 0.1),
    shadingToonyFactor: 0.62,
    shadingShiftFactor: -0.42,
    giEqualizationFactor: 0.6,
    side: T.DoubleSide,
  });
  material.name = name;
  return material;
}
