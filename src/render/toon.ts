import * as T from "three";
import { MToonMaterial } from "@pixiv/three-vrm";
import { shareMaterial } from "./modeling";

/** Wardrobe colors use the avatar's cel shading instead of reflective PBR. */
export function toon(color: T.ColorRepresentation, name = "anime-cloth") {
  // Identical cloth is the same cloth: accessories that ask for a color twice
  // share one material, so their meshes merge instead of doubling the draws.
  const key = `${name}|${new T.Color(color).getHexString()}`;
  const cached = cache.get(key);
  if (cached) return cached;
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
  cache.set(key, shareMaterial(material));
  return material;
}
const cache = new Map<string, MToonMaterial>();
