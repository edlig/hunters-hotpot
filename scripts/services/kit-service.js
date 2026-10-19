import { HOTPOT_CONFIG } from "../config.js";

export class KitService {
  static getStats(kitItem) {
    const uses = kitItem.system.uses || {};
    const current = uses.value !== undefined ? uses.value : Math.max(0, (uses.max || 0) - (uses.spent || 0));
    return { max: uses.max || 0, current };
  }

  static getValidMaterials(actor) {
    return actor.items.filter(i => i.flags?.["hunters-hotpot"]?.craftType);
  }

  static async getOrCreateKit(actor) {
    let kit = actor.items.find(i => i.getFlag("hunters-hotpot", "isKit") || i.name.toLowerCase().includes("набор свежевателя"));
    if (!kit) {
      const kitData = {
        name: "Набор Свежевателя", type: "consumable", img: "icons/tools/medical/toolkit-surgical-pink.webp",
        system: {
          type: { value: "tool" }, uses: { max: 10, value: 10, spent: 0, per: "charges", autoDestroy: false },
          description: { value: "<p>Набор ножей, пил, скребков и алхимических солей для свежевания.</p>" },
          weight: { value: 5, units: "lb" }, price: { value: 10, denomination: "gp" }
        },
        flags: { "hunters-hotpot": { isKit: true } }
      };
      const created = await actor.createEmbeddedDocuments("Item", [kitData]);
      kit = created[0];
      ui.notifications.info("Набор Свежевателя выдан ремесленнику.");
    }
    return kit;
  }

  static async processRepair(actor, kitItem, selectedItems, chargesToAdd, mode) {
    let weightConsumed = 0;
    
    const itemsToDelete = [];
    const itemsToUpdate = [];

    for (const sel of selectedItems) {
      const item = actor.items.get(sel.id);
      if (!item) continue;

      const unitWeight = item.system.weight?.value || 0;
      const currentQty = item.system.quantity || 1;
      
      // Берем ровно столько, сколько указал игрок в инпуте (с защитой от большего числа)
      const unitsToConsume = Math.min(sel.qty, currentQty); 

      weightConsumed += unitsToConsume * unitWeight;

      if (unitsToConsume >= currentQty) {
        itemsToDelete.push(sel.id); 
      } else {
        itemsToUpdate.push({
          _id: sel.id,
          "system.quantity": currentQty - unitsToConsume 
        });
      }
    }

    if (itemsToDelete.length > 0) await actor.deleteEmbeddedDocuments("Item", itemsToDelete);
    if (itemsToUpdate.length > 0) await actor.updateEmbeddedDocuments("Item", itemsToUpdate);

    const stats = this.getStats(kitItem);
    let newMax = stats.max;
    let newCurrent = stats.current;

    // Ремонт не может превысить макс. емкость
    if (mode === "upgrade") {
      newMax += chargesToAdd;
      newCurrent += chargesToAdd;
    } else {
      newCurrent = Math.min(newMax, stats.current + chargesToAdd);
    }

    const newSpent = Math.max(0, newMax - newCurrent);

    await actor.updateEmbeddedDocuments("Item", [{
      _id: kitItem.id,
      "system.uses.max": newMax,
      "system.uses.value": newCurrent, 
      "system.uses.spent": newSpent    
    }]);

    return { mode, chargesToAdd, weightConsumed };
  }
}