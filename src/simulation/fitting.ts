import { ITEM } from "./data";
import { COLLECTIONS } from "./adventure";
import type { Outfit, Save } from "./game";

type Appearance = Pick<Save, "outfit" | "dye">;

/** A disposable appearance, never part of the player's save or ownership. */
export class FittingRoom {
  private look: Appearance | null = null;

  get active() {
    return this.look !== null;
  }

  begin(saved: Appearance) {
    this.look ??= { outfit: { ...saved.outfit }, dye: saved.dye };
  }

  end() {
    this.look = null;
  }

  appearance(saved: Appearance): Appearance {
    const look = this.look ?? saved;
    return { outfit: { ...look.outfit }, dye: look.dye };
  }

  tryItem(saved: Appearance, id: string) {
    const item = ITEM[id];
    if (!item) return false;
    this.begin(saved);
    this.look!.outfit[item.category] = id;
    if (item.category === "dress") this.look!.dye = null;
    return true;
  }

  tryCollection(saved: Appearance, index: number) {
    const collection = COLLECTIONS[index];
    if (!collection) return false;
    this.begin(saved);
    this.look = {
      outfit: Object.fromEntries(
        collection.items.map((id) => [ITEM[id].category, id]),
      ) as Outfit,
      dye: null,
    };
    return true;
  }

  dye(saved: Appearance, color: string | null) {
    if (color !== null && !/^#[0-9a-f]{6}$/i.test(color)) return false;
    this.begin(saved);
    this.look!.dye = color;
    return true;
  }
}
