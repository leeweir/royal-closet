import * as T from "three";
import { sharedTextures, sharedMaterials } from "./modeling";
export function disposeGroup(root: T.Object3D) {
  const geos = new Set<T.BufferGeometry>(),
    mats = new Set<T.Material>(),
    textures = new Set<T.Texture>();
  root.traverse((o) => {
    if (o instanceof T.Mesh || o instanceof T.Points) {
      geos.add(o.geometry);
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        mats.add(m);
        for (const value of Object.values(m))
          if (value instanceof T.Texture && !sharedTextures.has(value))
            textures.add(value);
      });
      if (o instanceof T.InstancedMesh) o.dispose();
    }
  });
  geos.forEach((g) => g.dispose());
  textures.forEach((t) => t.dispose());
  mats.forEach((m) => {
    if (!sharedMaterials.has(m)) m.dispose();
  });
}
