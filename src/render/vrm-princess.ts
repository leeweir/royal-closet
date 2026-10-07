import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  MToonMaterial,
  VRMLoaderPlugin,
  VRMUtils,
  type VRM,
} from "@pixiv/three-vrm";
import { profile, mesh } from "./modeling";
import { poseWandHand } from "./wand-grip";
import { TORSO_PROFILE } from "./body-fit";

/** Load the approved avatar once; wardrobe meshes share its humanoid pose. */
export async function loadVrmBase() {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const response = await fetch(
    new URL("./models/princess-base.vrm", document.baseURI),
    {
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!response.ok) throw new Error(`Princess model HTTP ${response.status}`);
  const gltf = await loader.parseAsync(await response.arrayBuffer(), "");
  const vrm = gltf.userData.vrm as VRM;
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.combineSkeletons(gltf.scene);
  VRMUtils.combineMorphs(vrm);

  const root = new T.Group();
  root.name = "princess";
  const nativeHair: T.Mesh[] = [];
  const processedGeometry = new Set<T.BufferGeometry>();
  const processedMaterials = new Set<T.Material>();
  const body = vrm.scene;
  body.scale.setScalar(2.04);
  root.add(body);

  // Remove the sample's T-shirt, shorts and trainers; retain its authored
  // face, body, hair, humanoid rig, UVs and facial morph targets.
  body.traverse((object) => {
    if (!(object instanceof T.Mesh)) return;
    object.frustumCulled = false;
    object.castShadow = true;
    object.receiveShadow = false;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    if (
      materials.some((mat) => mat.name.startsWith("Body_00_SKIN")) &&
      !processedGeometry.has(object.geometry)
    ) {
      processedGeometry.add(object.geometry);
      // VRoid's original T-shirt masks portions of the torso. Keep its
      // authored arms and legs, replace the covered torso with a fitted shell.
      const g = object.geometry;
      const pos = g.getAttribute("position");
      const index = g.index!;
      const kept: number[] = [];
      for (let i = 0; i < index.count; i += 3) {
        const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
        const torso = ids.every(
          (id) =>
            Math.abs(pos.getX(id)) < 0.18 &&
            pos.getY(id) > 0.7 &&
            pos.getY(id) < 1.345,
        );
        if (!torso) kept.push(...ids);
      }
      g.setIndex(kept);
    }
    if (materials.some((mat) => /HAIR/.test(mat.name))) {
      nativeHair.push(object);
    }
    for (const mat of materials) {
      if (processedMaterials.has(mat)) continue;
      processedMaterials.add(mat);
      if (/CLOTH/.test(mat.name)) mat.visible = false;
      if (mat instanceof MToonMaterial) {
        mat.outlineWidthFactor *= 0.45;
        mat.outlineColorFactor.set("#6a4d68");
        mat.giEqualizationFactor = 0.9;
        if (/HAIR/.test(mat.name)) {
          mat.outlineWidthFactor = 0;
          mat.color.set("#bca6d3");
          mat.shadeColorFactor.set("#706080");
          mat.shadeMultiplyTexture = null;
          // Recolor in the material shader, retaining the source texture's
          // strand lighting and alpha rather than editing the model asset.
          const compileMToon = mat.onBeforeCompile.bind(mat);
          const mtoonCacheKey = mat.customProgramCacheKey.bind(mat);
          mat.onBeforeCompile = (shader, renderer) => {
            compileMToon(shader, renderer);
            shader.fragmentShader = shader.fragmentShader.replace(
              "diffuseColor *= sampledDiffuseColor;",
              `float strand = dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
               sampledDiffuseColor.rgb = vec3(0.3 + 0.7 * clamp(strand * 2.8, 0.0, 1.0));
               diffuseColor *= sampledDiffuseColor;`,
            );
          };
          mat.customProgramCacheKey = () =>
            `${mtoonCacheKey()}-princess-lavender-hair-v1`;
        }
      }
    }
  });

  // The normalized humanoid is authored in a T-pose. Lower the arms using
  // its bone axes instead of rotating raw joints with model-specific axes.
  const bone = (
    name: Parameters<typeof vrm.humanoid.getNormalizedBoneNode>[0],
  ) => vrm.humanoid.getNormalizedBoneNode(name)!;
  bone("leftUpperArm").rotation.z = -1.31;
  bone("rightUpperArm").rotation.z = 1.31;
  bone("leftLowerArm").rotation.y = -0.1;
  bone("rightLowerArm").rotation.y = 0.1;
  bone("leftHand").rotation.y = -0.12;
  bone("rightHand").rotation.y = 0.12;
  poseWandHand(vrm);
  vrm.update(0);
  root.updateMatrixWorld(true);
  // The loader initialized spring tails at the model's original scale.
  // Re-seed them after scaling and posing, before the first animated frame.
  // Simulate hair in character space: walking and turning must not fling the
  // long strands sideways. Head and upper-body motion still drive the springs.
  for (const joint of vrm.springBoneManager?.joints ?? []) joint.center = root;
  vrm.springBoneManager?.setInitState();

  const skin = new MToonMaterial({
    color: new T.Color("#fff0e9"),
    shadeColorFactor: new T.Color("#dfbac3"),
    shadingToonyFactor: 0.7,
    giEqualizationFactor: 0.9,
  });
  const skinSource = new T.Group();
  skinSource.name = "fitted-body";
  mesh(profile(TORSO_PROFILE), skin, skinSource).castShadow = false;

  return { root, vrm, nativeHair, skinSource };
}
