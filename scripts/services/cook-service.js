import { HOTPOT_CONFIG } from "../config.js";

export class CookService {
  /**
   * Списание ингредиентов из инвентаря (С учетом Quantity)
   */
  static async consumeIngredients(cookActor, selectedItems, requiredWeight, essId) {
    let weightToConsume = requiredWeight;
    let deletes = [];
    let updates = [];

    // 1. Списываем основные ингредиенты (мясо, кости и т.д.)
    for (let sel of selectedItems) {
      if (weightToConsume <= 0) break;
      const item = cookActor.items.get(sel.id);
      if (!item) continue;

      const w = Number(item.system.weight?.value || 0);
      const q = Number(item.system.quantity || 1);

      if (sel.u) {
        deletes.push(item.id);
        weightToConsume -= (w * q);
      } else {
        const itemsToConsume = Math.ceil(weightToConsume / w);
        if (itemsToConsume >= q) {
          deletes.push(item.id);
        } else {
          updates.push({ _id: item.id, "system.quantity": q - itemsToConsume });
        }
        weightToConsume -= (itemsToConsume * w);
      }
    }

    // 2. ИСПРАВЛЕНО: Списываем ровно ОДНУ эссенцию
    if (essId && essId !== "none") {
      const essItem = cookActor.items.get(essId);
      if (essItem) {
        const q = Number(essItem.system.quantity || 1);
        if (q > 1) {
          // Если эссенций несколько, отнимаем одну
          updates.push({ _id: essId, "system.quantity": q - 1 });
        } else {
          // Если осталась последняя, удаляем предмет
          deletes.push(essId);
        }
      }
    }

    // 3. Применяем изменения к инвентарю
    if (updates.length > 0) await cookActor.updateEmbeddedDocuments("Item", updates);
    if (deletes.length > 0) await cookActor.deleteEmbeddedDocuments("Item", deletes);
  }

  static generateEffectData(outcome, recipe, essDice, essFlat, dmgType, dominantType, specificStat, cookActor) {
    if (outcome === "ruined") {
      return {
        name: "🤢 Испорченная жижа (Отравление)",
        img: "icons/consumables/meat/steak-spoiled-yellow.webp",
        changes: [{ key: "system.traits.ci.value", mode: 2, value: "poisoned" }],
        duration: { seconds: 3600 },
        flags: { "hunters-hotpot": { isFood: true } }
      };
    }

    const changes = [];
    let nameSuffix = "";

    switch (recipe.effectKey) {
      case "bonusChecks":
        changes.push({ key: `system.abilities.${specificStat}.bonuses.check`, mode: 2, value: `+${essDice}` });
        nameSuffix = ` (${CONFIG.DND5E.abilities[specificStat]?.label || specificStat})`;
        break;

      case "bonusSaves":
        changes.push({ key: `system.abilities.${specificStat}.bonuses.save`, mode: 2, value: `+${essDice}` });
        nameSuffix = ` (${CONFIG.DND5E.abilities[specificStat]?.label || specificStat})`;
        break;

      case "bonusDamage":
        changes.push({ key: "system.rolls.damage.all.bonus", mode: 2, value: `+${essDice}[${dmgType}]` });
        nameSuffix = ` (${CONFIG.DND5E.damageTypes[dmgType]?.label || dmgType})`;
        break;

      case "drElement":
        changes.push({ key: `system.traits.dm.amount.${dmgType}`, mode: 2, value: `-${essFlat}` });
        nameSuffix = ` (${CONFIG.DND5E.damageTypes[dmgType]?.label || dmgType}) [-${essFlat} урона]`;
        break;

      case "maxHp":
        changes.push({ key: "system.attributes.hp.tempmax", mode: 2, value: `5*${essFlat}` });
        nameSuffix = ` [+${essFlat} ХП]`;
        break;
    }

    // 16 часов (57600 сек) для шедевра, 8 часов (28800 сек) для обычной еды
    const durationSeconds = outcome === "positive" ? 57600 : 28800;

    return {
      name: `Сытость: ${recipe.name}${nameSuffix}`,
      img: recipe.img,
      description: recipe.desc,
      changes: changes,
      duration: {
        seconds: durationSeconds,
        startTime: game.time.worldTime
      },
      flags: { "hunters-hotpot": { isFood: true } }
    };
  }

  /**
   * Наложение эффектов на список акторов
   */
  static async applyEffectsToActors(actorIds, foodEffect) {
    const effectsToCreate = [foodEffect].filter(e => e !== null && e !== undefined);
    if (effectsToCreate.length === 0) return;

    for (let id of actorIds) {
      const actor = game.actors.get(id);
      if (!actor) continue;

      const toDelete = actor.effects.filter(e => {
        const eName = e.name || "";
        const isF = e.getFlag("hunters-hotpot", "isFood") || eName.includes("Сытость") || eName.includes("Испорченная жижа");
        return isF;
      }).map(e => e.id);

      if (toDelete.length > 0) {
        await actor.deleteEmbeddedDocuments("ActiveEffect", toDelete);
      }

      // Накладываем свежие
      const clonedEffects = effectsToCreate.map(e => foundry.utils.deepClone(e));
      await actor.createEmbeddedDocuments("ActiveEffect", clonedEffects);
    }
  }

  static async createLeftovers(cookActor, quantity, foodEffect, isRuined) {
    if (quantity <= 0 || !foodEffect) return []; // Возвращаем пустой массив, если порций 0
    const activityId = foundry.utils.randomID();

    let fEff = foundry.utils.deepClone(foodEffect);
    fEff._id = foundry.utils.randomID();
    fEff.transfer = false;

    const itemData = {
      name: fEff.name,
      type: "consumable",
      img: fEff.img,
      system: {
        type: { value: "food" },
        quantity: quantity,
        weight: { value: 1, units: "lb" },
        description: { value: "<p>Остатки с привала. Теряют свойства через 1 час.</p>" },
        uses: { value: 1, max: "1", per: "charges", autoDestroy: true },
        activities: {
          [activityId]: {
            type: "utility",
            name: "Съесть порцию",
            activation: { type: "action", value: 1 },
            target: { affix: false, prompt: true, type: "creature", value: 1 },
            consumption: { targets: [{ type: "itemUses", value: 1 }] },
            effects: [{ _id: fEff._id }]
          }
        }
      },
      effects: [fEff],
      flags: { "hunters-hotpot": { isLeftovers: true } }
    };

    return await cookActor.createEmbeddedDocuments("Item", [itemData]);
  }
}