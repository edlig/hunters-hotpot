import { HOTPOT_CONFIG } from "../config.js";

export class CraftService {
  /**
   * ФАЗА 1: Списание сырья и создание Заготовки
   */
  static async startCraftingProject(actor, category, rarity, essId, selectedItems, targetCost, activeRecipe, batchQty = 1) {
    let deletes = [];
    let updates = [];

    if (essId && essId !== "none") deletes.push(essId);

    for (let sel of selectedItems) {
      const item = actor.items.get(sel.id);
      if (!item) continue;
      const currentQty = item.system.quantity || 1;
      const unitsToConsume = Math.min(sel.qty, currentQty);

      if (unitsToConsume >= currentQty) deletes.push(sel.id);
      else updates.push({ _id: sel.id, "system.quantity": currentQty - unitsToConsume });
    }

    if (deletes.length > 0) await actor.deleteEmbeddedDocuments("Item", deletes);
    if (updates.length > 0) await actor.updateEmbeddedDocuments("Item", updates);

    const rData = HOTPOT_CONFIG.crafting.rarity[rarity];
    const timeMult = game.settings.get("hunters-hotpot", "craftTimeMultiplier") ?? 1;
    const isConsumable = category === "potion" || activeRecipe?.isConsumable;

    // Время не умножается на размер партии, всё варится в одном котле!
    const baseHours = isConsumable ? Math.max(1, Math.floor(rData.hours / 2)) : rData.hours;
    const targetHours = Math.max(1, Math.floor(baseHours * timeMult));

    const recipeName = activeRecipe ? activeRecipe.name : "Неизвестный рецепт";
    const batchStr = batchQty > 1 ? ` (x${batchQty})` : ""; // Визуальная приписка

    const wipData = {
      name: `Заготовка: ${recipeName}${batchStr} (${rData.label})`,
      type: "loot", img: "icons/sundries/documents/blueprints-teal.webp",
      system: { description: { value: `<p>Незавершенный проект. Текущий прогресс: <b>0 / ${targetHours} ч.</b></p>` }, weight: { value: 1, units: "lb" } },
      flags: {
        "hunters-hotpot": {
          isWIP: true, category, rarity, essId, recipeName, targetHours, currentHours: 0,
          successes: 0, failures: 0, dc: rData.dc,
          batchQty // СОХРАНЯЕМ ПАРТИЮ ВО ФЛАГАХ!
        }
      }
    };

    await actor.createEmbeddedDocuments("Item", [wipData]);
  }

  /**
   * ФАЗА 2: Работа над заготовкой
   */
  static async processWorkSession(actor, wipItem, hoursWorked, hasHelper, hasProf, statId, roll) {
    const targetHours = wipItem.getFlag("hunters-hotpot", "targetHours") || 1;
    const currentHours = wipItem.getFlag("hunters-hotpot", "currentHours") || 0;
    const dc = wipItem.getFlag("hunters-hotpot", "dc") || 10;
    const successes = wipItem.getFlag("hunters-hotpot", "successes") || 0;
    const failures = wipItem.getFlag("hunters-hotpot", "failures") || 0;

    const pb = hasProf ? (actor.system.attributes?.prof || 2) : 0;
    const statMod = actor.system.abilities?.[statId]?.mod || 0;
    const totalCheck = roll.total + statMod + pb;

    let effectiveHours = hoursWorked * (hasHelper ? 2 : 1);
    let progress = 0; let successMod = 0; let failMod = 0; let msg = "";

    const isNat20 = roll.terms[0].results[0].result === 20;
    const isNat1 = roll.terms[0].results[0].result === 1;

    if (isNat1) {
      progress = 0; failMod = 1; msg = "Критический провал! Вы потратили время впустую и повредили детали.";
    } else if (isNat20) {
      progress = effectiveHours * 2; successMod = 1; msg = "Критический успех! Блестящая догадка удвоила темп (x2).";
    } else if (totalCheck >= dc) {
      progress = effectiveHours; successMod = 1; msg = "Успешная работа. Проект стабильно продвигается.";
    } else {
      progress = Math.floor(effectiveHours * 0.5); failMod = 1; msg = "Работа шла тяжело. Сохранена лишь половина прогресса.";
    }

    const newHours = Math.min(targetHours, currentHours + progress);
    const newSuccesses = successes + successMod;
    const newFailures = failures + failMod;
    const isFinished = newHours >= targetHours;

    await actor.updateEmbeddedDocuments("Item", [{
      _id: wipItem.id,
      "system.description.value": `<p>Незавершенный проект. Текущий прогресс: <b>${newHours} / ${targetHours} ч.</b></p>`,
      "flags.hunters-hotpot.currentHours": newHours,
      "flags.hunters-hotpot.successes": newSuccesses,
      "flags.hunters-hotpot.failures": newFailures
    }]);

    this.sendWorkReport(actor, wipItem.name, msg, roll.terms[0].results[0].result, statMod, pb, totalCheck, dc, progress, newHours, targetHours, isFinished);

    if (isFinished) {
      const allFlags = wipItem.flags["hunters-hotpot"] || {};
      await this.finishCrafting(actor, wipItem.id, newSuccesses, newFailures, allFlags);
    }
  }

  /**
   * ФАЗА 3: Финализация и оценка качества
   */
  static async finishCrafting(actor, wipItemId, successes, failures, flags) {
    const score = successes - failures;
    const rarityLabel = HOTPOT_CONFIG.crafting.rarity[flags.rarity].label;
    const batchQty = flags.batchQty || 1;

    let itemName = `${flags.recipeName} (${rarityLabel})`;
    let description = `<p>Создано из трофеев монстров. <i>(Успехов: ${successes}, Провалов: ${failures})</i></p>`;

    if (score > 0) {
      const q = HOTPOT_CONFIG.crafting.quirks.positive[Math.floor(Math.random() * HOTPOT_CONFIG.crafting.quirks.positive.length)];
      itemName = `✨ Шедевр: ${itemName}`;
      description += `<p><b>Причуда (${q.name}):</b> ${q.desc}</p>`;
    } else if (score < 0) {
      const q = HOTPOT_CONFIG.crafting.quirks.negative[Math.floor(Math.random() * HOTPOT_CONFIG.crafting.quirks.negative.length)];
      itemName = `🤢 Брак: ${itemName}`;
      description += `<p><b>Причуда (${q.name}):</b> ${q.desc}</p>`;
    }

    const typeMapping = { weapon: "weapon", armor: "equipment", potion: "consumable", trinket: "equipment" };
    const imgMapping = {
      weapon: "icons/skills/trades/smithing-tongs-metal-red.webp",
      armor: "icons/skills/trades/textiles-stitching-leather-brown.webp",
      trinket: "icons/skills/social/orb-gold-claw-yellow.webp",
      potion: "icons/skills/toxins/cauldron-pot-bubbles-green.webp"
    };

    const itemData = {
      name: itemName,
      type: typeMapping[flags.category],
      img: imgMapping[flags.category],
      system: {
        description: { value: description },
        rarity: rarityLabel.toLowerCase(),
        weight: { value: flags.category === "potion" ? 0.5 : 3, units: "lb" },
        quantity: batchQty
      }
    };

    if (flags.category === "potion") {
      itemData.system.type = { value: "potion" };
      itemData.system.uses = { value: 1, max: "1", per: "charges", autoDestroy: true };
    }

    await actor.createEmbeddedDocuments("Item", [itemData]);
    await actor.deleteEmbeddedDocuments("Item", [wipItemId]);

    const batchStr = batchQty > 1 ? `${batchQty}x ` : "";

    // Адаптивная карточка финализации
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }), content: `<div style="background: var(--dnd5e-color-card-background, rgba(0,0,0,0.02)); padding:10px; border:1px solid #10b981; border-radius:6px; color: inherit;">
        <h3 style="margin: 0 0 6px; border-bottom: 1px solid #10b981; padding-bottom: 4px;">🎉 Проект завершен!</h3>
        <p style="margin:0;"><b>${batchStr}${itemName}</b> добавлен в инвентарь.</p>
    </div>` });
  }

  static sendWorkReport(actor, wipName, msg, baseRoll, statMod, pb, totalCheck, dc, progress, current, target, isFinished) {
    const isCrit = msg.includes("Критический успех");
    const isFail = msg.includes("провал") || msg.includes("тяжело");
    const color = isCrit ? "#10b981" : isFail ? "#ef4444" : "var(--dnd5e-color-gold, #0284c7)";

    // Адаптивная карточка процесса работы
    const html = `
      <div style="border: 1px solid var(--color-border-light-tertiary, #cbd5e1); border-radius: 6px; background: var(--dnd5e-color-card-background, rgba(0,0,0,0.02)); padding: 10px; font-family: inherit; color: inherit;">
        <h4 style="margin: 0 0 6px; border-bottom: 1px solid var(--color-border-light-tertiary, #cbd5e1); padding-bottom: 4px;">🔨 Работа: ${wipName}</h4>
        <div style="font-size: 11px; background: rgba(0,0,0,0.1); padding: 6px; border-radius: 4px; margin-bottom: 8px; border: 1px solid var(--color-border-light-tertiary, #cbd5e1);">
          Бросок: <b style="font-size: 13px;">${totalCheck}</b> (Куб: ${baseRoll}, Хар: ${statMod >= 0 ? '+' + statMod : statMod}, Инстр: +${pb}) | СЛ: ${dc}
        </div>
        <p style="margin:0 0 6px; font-size: 12px; color: ${color}; font-weight: bold;">${msg}</p>
        <div style="font-size: 12px; background: rgba(0,0,0,0.05); padding: 6px; border: 1px dashed var(--color-border-light-tertiary, #cbd5e1); border-radius: 4px;">
          Вложено часов: <b>+${progress}</b><br>
          Прогресс: <b>${current} / ${target} ч.</b>
        </div>
        ${isFinished ? `<div style="margin-top:6px; color:#10b981; font-weight:bold; text-align:center;">Проект готов!</div>` : ''}
      </div>`;
    ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: html });
  }
}