import { HOTPOT_CONFIG } from "../config.js";

export class CookService {
  /**
   * Списание ингредиентов из инвентаря (С учетом Quantity)
   */
  static async consumeIngredients(actor, selectedItems, requiredWeight, essId) {
    let deletes = [];
    let updates = [];

    if (essId && essId !== "none") deletes.push(essId);

    let targetW = requiredWeight;

    for (let s of selectedItems) {
      if (targetW <= 0) break;
      const item = actor.items.get(s.id);
      if (!item) continue;

      const currentQty = item.system.quantity || 1;
      const unitWeight = item.system.weight?.value || 0.1;

      if (s.u) {
        // Неделимый предмет (Орган): Жрет весь стак целиком и дает свой полный вес
        targetW -= (unitWeight * currentQty);
        deletes.push(s.id);
      } else {
        // Делимый предмет (Мясо): Откусываем от стака нужное количество штук
        let unitsNeeded = Math.ceil(targetW / unitWeight);
        let unitsToConsume = Math.min(unitsNeeded, currentQty);

        targetW -= (unitsToConsume * unitWeight);

        if (unitsToConsume >= currentQty) {
          deletes.push(s.id);
        } else {
          updates.push({ _id: s.id, "system.quantity": currentQty - unitsToConsume });
        }
      }
    }

    if (deletes.length > 0) await actor.deleteEmbeddedDocuments("Item", deletes);
    if (updates.length > 0) await actor.updateEmbeddedDocuments("Item", updates);
  }

  /**
   * Генерация данных эффекта (ActiveEffect v3+)
   */
  static generateEffectData(outcome, baseType, essenceData, dmgType, dominantType, specificStat, cookActor) {
    if (outcome === "ruined") {
      return {
        _id: foundry.utils.randomID(),
        name: "Испорченное варево (Отравление)",
        icon: "icons/consumables/meat/steak-spoiled-yellow.webp",
        img: "icons/consumables/meat/steak-spoiled-yellow.webp",
        changes: [{ key: "macro.CE", mode: 0, value: "Poisoned" }],
        duration: { seconds: 3600 },
        origin: cookActor.uuid,
        transfer: false
      };
    }

    const recipe = HOTPOT_CONFIG.recipes.tier1[baseType] || HOTPOT_CONFIG.recipes.tier1["meat_steak"];
    const s = essenceData.dice || "1";
    let changes = [];

    switch (recipe.effectKey) {
      case "bonusDamage":
        changes.push({ key: "system.bonuses.mwak.damage", mode: 2, value: `+ ${s}[${dmgType}]` });
        changes.push({ key: "system.bonuses.rwak.damage", mode: 2, value: `+ ${s}[${dmgType}]` });
        changes.push({ key: "system.bonuses.msak.damage", mode: 2, value: `+ ${s}[${dmgType}]` });
        changes.push({ key: "system.bonuses.rsak.damage", mode: 2, value: `+ ${s}[${dmgType}]` });
        break;

      case "maxHp":
        changes.push({ key: "system.attributes.hp.tempmax", mode: 2, value: s === "1" ? "5" : `5 * ${s}` });
        break;

      case "drElement":
        changes.push({ key: `system.traits.dm.amount.${dmgType}`, mode: 2, value: `- ${s}` });
        break;

      case "bonusChecks":
        changes.push({ key: "system.bonuses.abilities.check", mode: 2, value: `+ ${s}` });
        break;

      case "bonusSaves":
        changes.push({ key: "system.bonuses.abilities.save", mode: 2, value: `+ ${s}` });
        break;

      default:
        changes.push({ key: "system.bonuses.mwak.damage", mode: 2, value: `${s}[${dmgType}]` });
    }

    return {
      _id: foundry.utils.randomID(),
      name: `Сытость: ${recipe.name} (${CONFIG.DND5E.damageTypes[dmgType]?.label || dmgType})`, icon: recipe.img, img: recipe.img,
      changes,
      duration: { seconds: 28800 },
      origin: cookActor.uuid,
      transfer: false
    };
  }

  /**
   * Генерация эффекта Причуды
   */
  static generateQuirkEffect(quirk, outcome, cookActor) {
    if (!quirk || !quirk.eff || quirk.eff.length === 0) return null;
    const qIcon = outcome === "positive" ? "icons/magic/light/explosion-star-glow-yellow.webp" : "icons/magic/death/skull-poison-green.webp";
    return {
      _id: foundry.utils.randomID(),
      name: `Причуда: ${quirk.name}`,
      icon: qIcon, img: qIcon,
      changes: quirk.eff,
      duration: { seconds: 28800 },
      origin: cookActor.uuid,
      transfer: false
    };
  }

  /**
   * Наложение эффектов на список акторов
   */
  static async applyEffectsToActors(actorIds, foodEffect, quirkEffect) {
    for (let id of actorIds) {
      const a = game.actors.get(id);
      if (a) {
        let effects = [foundry.utils.deepClone(foodEffect)];
        if (quirkEffect) effects.push(foundry.utils.deepClone(quirkEffect));
        await a.createEmbeddedDocuments("ActiveEffect", effects);
      }
    }
  }

  /**
   * Создание предмета-остатков с dnd5e 5.3.3 Activities API
   */
  static async createLeftovers(cookActor, quantity, foodEffect, quirkEffect, isRuined) {
    if (quantity <= 0) return;
    const activityId = foundry.utils.randomID();

    let effectsToAttach = [foundry.utils.deepClone(foodEffect)];
    let effectRefs = [{ _id: foodEffect._id }];

    if (quirkEffect) {
      effectsToAttach.push(foundry.utils.deepClone(quirkEffect));
      effectRefs.push({ _id: quirkEffect._id });
    }

    const itemData = {
      name: foodEffect.name,
      type: "consumable",
      img: foodEffect.img,
      system: {
        type: { value: "food" },
        quantity: quantity,
        weight: { value: 1, units: "lb" },
        description: { value: "<p>Остатки с привала. Теряют свойства через 1 час. При использовании накладывает эффект блюда.</p>" },
        uses: { value: 1, max: "1", per: "charges", autoDestroy: true },
        activities: {
          [activityId]: {
            type: "utility", name: "Съесть порцию",
            activation: { type: "action", value: 1 },
            target: { template: { contiguous: false, units: "ft" }, affix: false },
            consumption: { targets: [{ type: "itemUses", value: "1" }] },
            effects: effectRefs
          }
        }
      },
      effects: effectsToAttach
    };

    await cookActor.createEmbeddedDocuments("Item", [itemData]);
  }
}