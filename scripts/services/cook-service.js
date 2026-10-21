import { HOTPOT_CONFIG } from "../config.js";

export class CookService {
  /**
   * Списание ингредиентов из инвентаря (С учетом Quantity)
   */
  static async consumeIngredients(cookActor, selectedItems, requiredWeight, essId) {
    let weightToConsume = requiredWeight;
    let deletes = [];
    let updates = [];

    // selectedItems — это массив из CookApp [{id, w, u, type}]
    for (let sel of selectedItems) {
      if (weightToConsume <= 0) break;
      const item = cookActor.items.get(sel.id);
      if (!item) continue;

      // Получаем вес ОДНОЙ штуки и количество в стаке
      const w = Number(item.system.weight?.value || 0);
      const q = Number(item.system.quantity || 1);

      if (sel.u) {
        // Уникальный орган или неделимый кусок — кидаем в котел целиком
        deletes.push(item.id);
        weightToConsume -= (w * q);
      } else {
        // Обычное сырье (мясо, кости). Считаем, сколько штук нужно откусить
        const itemsToConsume = Math.ceil(weightToConsume / w);

        if (itemsToConsume >= q) {
          deletes.push(item.id); // Забираем стак целиком
        } else {
          updates.push({ _id: item.id, "system.quantity": q - itemsToConsume }); // Забираем часть
        }
        weightToConsume -= (itemsToConsume * w);
      }
    }

    if (essId && essId !== "none") deletes.push(essId);
    if (updates.length > 0) await cookActor.updateEmbeddedDocuments("Item", updates);
    if (deletes.length > 0) await cookActor.deleteEmbeddedDocuments("Item", deletes);
  }

  static generateEffectData(outcome, recipe, essData, dmgType, dominantType, specificStat, cookActor) {
    if (outcome === "ruined") {
      return {
        name: "🤢 Испорченная жижа (Отравление)",
        img: "icons/consumables/meat/steak-spoiled-yellow.webp",
        changes: [{ key: "system.traits.ci.value", mode: 2, value: "poisoned" }],
        duration: { seconds: 3600 } // 1 час
      };
    }

    // Никакого поиска и костылей. Берем переданный объект рецепта.
    const dice = essData ? essData.dice : "1";
    const changes = [];
    let nameSuffix = ""; // Суффикс для названия

    switch (recipe.effectKey) {
      case "bonusChecks":
        changes.push({ key: `system.abilities.${specificStat}.bonuses.check`, mode: 2, value: `+${dice}` });
        nameSuffix = ` (${CONFIG.DND5E.abilities[specificStat]?.label || specificStat})`;
        break;
      case "bonusSaves":
        changes.push({ key: `system.abilities.${specificStat}.bonuses.save`, mode: 2, value: `+${dice}` });
        nameSuffix = ` (${CONFIG.DND5E.abilities[specificStat]?.label || specificStat})`;
        break;
      case "bonusDamage":
        changes.push({ key: "system.rolls.damage.all.bonus", mode: 2, value: `+${dice}[${dmgType}]` });
        nameSuffix = ` (${CONFIG.DND5E.damageTypes[dmgType]?.label || dmgType})`;
        break;
      case "drElement":
        changes.push({ key: `flags.midi-qol.DR.${dmgType}`, mode: 2, value: `-${dice}` });
        nameSuffix = ` (${CONFIG.DND5E.damageTypes[dmgType]?.label || dmgType})`;
        break;
      case "maxHp":
        changes.push({ key: "system.attributes.hp.bonuses.overall", mode: 2, value: `${dice}` });
        nameSuffix = "";
        break;
    }

    return {
      name: `Сытость: ${recipe.name}${nameSuffix}`,
      img: recipe.img,
      description: recipe.desc,
      changes: changes,
      duration: { seconds: 28800 } // 8 часов
    };
  }

  static generateQuirkEffect(quirk, outcome, cookActor) {
    if (!quirk || !quirk.eff || quirk.eff.length === 0) return null;

    const changes = quirk.eff.map(e => {
      let mode = e.mode;

      if (mode === 0 && e.key.includes("system.traits")) mode = 2;

      // Если мы включаем флаг Midi-QOL (advantage), нужен OVERRIDE (5)
      if (mode === 0 && e.key.includes("flags.midi-qol")) mode = 5;

      return {
        key: e.key,
        mode: mode,
        value: e.value
      };
    });

    return {
      name: `Причуда: ${quirk.name}`,
      img: outcome === "positive" ? "icons/magic/light/explosion-star-glow-blue-purple.webp" : "icons/skills/toxins/poison-bottle-corked-fire-green.webp",
      changes: changes,
      duration: { seconds: 28800 }, // 8 часов
      flags: { "hunters-hotpot": { isQuirk: true } }
    };
  }

  /**
   * Наложение эффектов на список акторов
   */
static async applyEffectsToActors(actorIds, foodEffect, quirkEffect) {
    const effectsToCreate = [foodEffect, quirkEffect].filter(e => e !== null && e !== undefined);
    if (effectsToCreate.length === 0) return;

    for (let id of actorIds) {
      const actor = game.actors.get(id);
      if (!actor) continue;

      // Удаляем старые баффы перед раздачей новых порций
      const toDelete = actor.effects.filter(e => {
        const eName = e.name || "";
        const isF = e.getFlag("hunters-hotpot", "isFood") || eName.includes("Сытость") || eName.includes("Испорченная жижа");
        const isQ = e.getFlag("hunters-hotpot", "isQuirk") || eName.includes("Причуда");
        return isF || isQ;
      }).map(e => e.id);

      if (toDelete.length > 0) {
        await actor.deleteEmbeddedDocuments("ActiveEffect", toDelete);
      }

      // Накладываем свежие
      const clonedEffects = effectsToCreate.map(e => foundry.utils.deepClone(e));
      await actor.createEmbeddedDocuments("ActiveEffect", clonedEffects);
    }
  }

static async createLeftovers(cookActor, quantity, foodEffect, quirkEffect, isRuined) {
    if (quantity <= 0 || !foodEffect) return;
    const activityId = foundry.utils.randomID();

    let fEff = foundry.utils.deepClone(foodEffect);
    fEff._id = foundry.utils.randomID();
    fEff.transfer = false;

    let effectsToAttach = [fEff];
    let effectRefs = [{ _id: fEff._id }];

    if (quirkEffect) {
      let qEff = foundry.utils.deepClone(quirkEffect);
      qEff._id = foundry.utils.randomID();
      qEff.transfer = false;
      effectsToAttach.push(qEff);
      effectRefs.push({ _id: qEff._id });
    }

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
            effects: effectRefs
          }
        }
      },
      effects: effectsToAttach,
      // Флаг для нашего перехватчика в main.js
      flags: { "hunters-hotpot": { isLeftovers: true } }
    };

    await cookActor.createEmbeddedDocuments("Item", [itemData]);
  }
}