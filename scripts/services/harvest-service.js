import { HOTPOT_CONFIG } from "../config.js";
import { KitService } from "./kit-service.js";

export class HarvestService {
  static validateTarget(token) {
    if (!token) throw new Error("Возьмите мертвого монстра в цель!");
    if (!token.actor) throw new Error("У этой цели нет листа персонажа.");
    if (token.actor.system.attributes.hp.value > 0) throw new Error("Оно еще живо! Сначала добейте.");
    const isGutted = token.actor.effects.find(e => e.name === "Распотрошен" || e.label === "Распотрошен");
    if (isGutted) throw new Error("Эта туша уже выпотрошена! Здесь больше нечего брать.");
  }

  static validateKit(actor, sizeData) {
    const kit = actor.items.find(i => i.getFlag("hunters-hotpot", "isKit") || i.name.toLowerCase().includes("набор свежевателя"));
    const cost = sizeData?.charge || 1;
    if (!kit) throw new Error("У вас нет Набора Свежевателя! Запустите макрос 'Ремонт Набора', чтобы получить его.");
    const stats = KitService.getStats(kit);
    if (stats.current < cost) throw new Error(`В Наборе не хватает зарядов (Осталось: ${stats.current} зар., а нужно ${cost}).`);
    return kit;
  }

  static async consumeKitCharge(playerActor, kit, cost) {
    if (!kit || cost <= 0) return;
    const stats = KitService.getStats(kit);
    const newCurrent = Math.max(0, stats.current - cost);
    const newSpent = Math.max(0, stats.max - newCurrent);
    await playerActor.updateEmbeddedDocuments("Item", [{ _id: kit.id, "system.uses.spent": newSpent }]);
    if (newCurrent === 0) ui.notifications.warn("В Наборе Свежевателя закончились инструменты и соли!");
  }

  static async applyHarvestEffect(ctx) {
    const effectData = { name: "Распотрошен", icon: "icons/skills/wounds/injury-abdomen-blood-red.webp", flags: { core: { overlay: false } } };
    const hasEffect = ctx.targetToken.actor.effects.some(e => e.name === "Распотрошен" || e.label === "Распотрошен");
    if (!hasEffect) await ctx.targetToken.actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
    await ctx.targetToken.actor.toggleStatusEffect("invisible", { active: true });
    if (ctx.kit) await this.consumeKitCharge(ctx.playerActor, ctx.kit, ctx.sizeData?.charge || 1);
  }

  static async generateLoot(ctx, selections, rollData, essObtained, essData) {
    let container = ctx.playerActor.items.find(i => i.type === "container" && i.name.includes("Мешок подарков"));
    if (!container) {
      const cData = { name: "Мешок подарков", type: "container", img: "icons/containers/bags/sack-leather-pink.webp", system: { capacity: { type: "weight", value: 9999 } } };
      const created = await ctx.playerActor.createEmbeddedDocuments("Item", [cData]);
      container = created[0];
    }

    const cookLabels = { meat: "Мясо", bone: "Кость", fluid: "Жидкость", organ: "Внутренности", spice: "Специи / Яды", mystic: "Мистика", any: "Универсально", none: "Несъедобно" };

    // Группируем лут внутри текущего сбора
    const groupedSelections = [];
    selections.forEach(sel => {
      const existing = groupedSelections.find(g => g.name === sel.name && g.cType === sel.cType);
      if (existing) {
        existing.q += sel.q;
        existing.slots += sel.slots;
      } else {
        groupedSelections.push({ ...sel });
      }
    });

    const itemsToCreate = [];
    const itemsToUpdate = [];
    const reportItems = []; // Массив-пустышка только для красивого отчета в чат

    for (let i of groupedSelections) {
      const finalName = rollData.isCrit ? `✨ ${i.name}` : i.name;
      const finalPrice = Number(i.p);

      // ИЩЕМ УЖЕ СУЩЕСТВУЮЩИЙ СТАК В ИНВЕНТАРЕ (Уборка мусора)
      const existingItem = ctx.playerActor.items.find(item =>
        item.name === finalName &&
        item.flags["hunters-hotpot"]?.cookBase === i.base &&
        item.flags["hunters-hotpot"]?.craftType === i.cType &&
        item.flags["hunters-hotpot"]?.sourceMonster === ctx.mName
      );

      if (existingItem) {
        // Докидываем количество в существующий предмет
        itemsToUpdate.push({
          _id: existingItem.id,
          "system.quantity": (existingItem.system.quantity || 1) + i.q
        });
      } else {
        // Создаем новый предмет, если такого еще нет
        const cTag = HOTPOT_CONFIG.craftTags[i.cType];
        const cookLabel = cookLabels[i.base] || i.base;

        const descHtml = `
        <div style="background: var(--dnd5e-color-card-background, rgba(0,0,0,0.02)); border: 1px solid var(--color-border-light-tertiary, #cbd5e1); padding: 6px; border-radius: 4px; font-family: sans-serif; color: var(--color-text-primary, inherit);">
          <p style="margin: 0 0 6px;">Трофей из <b>${ctx.mName}</b>.</p>
          <div style="display:flex; flex-direction:column; gap:4px; font-size:12px;">
            <div style="background: rgba(14, 165, 233, 0.1); color: inherit; padding: 4px 6px; border-radius: 4px; border: 1px solid rgba(14, 165, 233, 0.2); border-left: 3px solid #0ea5e9;">
              <b>${cTag?.icon || "🧩"} Ремесло:</b> ${cTag?.label || "Сырье"}
            </div>
            <div style="background: rgba(245, 158, 11, 0.1); color: inherit; padding: 4px 6px; border-radius: 4px; border: 1px solid rgba(245, 158, 11, 0.2); border-left: 3px solid #f59e0b;">
              <b>🍲 Кулинария:</b> ${cookLabel}
            </div>
          </div>
        </div>
      `;

        itemsToCreate.push({
          name: finalName, type: "loot", img: i.img,
          system: {
            type: { value: "material" }, container: container.id,
            quantity: i.q, weight: { value: Number(i.w), units: "lb" }, price: { value: finalPrice, denomination: "gp" },
            description: { value: descHtml }
          },
          flags: { "hunters-hotpot": { componentId: i.id, sourceMonster: ctx.mName, sourceType: ctx.mType, isPristine: rollData.isCrit, craftType: i.cType, cookBase: i.base, slots: i.slots } }
        });
      }

      // Сохраняем в отчет, чтобы игрок видел, что он добыл именно сейчас
      reportItems.push({
        name: finalName,
        system: { quantity: i.q, weight: { value: Number(i.w) }, price: { value: finalPrice } }
      });
    }

    if (essObtained && essData) {
      const finalEssName = `✨ ${essData.name} (${ctx.mName})`;
      const existingEss = ctx.playerActor.items.find(item => item.name === finalEssName && item.flags["hunters-hotpot"]?.isEssence);

      if (existingEss) {
        itemsToUpdate.push({ _id: existingEss.id, "system.quantity": (existingEss.system.quantity || 1) + 1 });
      } else {
        itemsToCreate.push({
          name: finalEssName, type: "loot", img: essData.img || "icons/sundries/gaming/dice-runed-brown.webp",
          system: {
            type: { value: "material" }, container: container.id, quantity: 1,
            weight: { value: 0.1, units: "lb" }, price: { value: essData.p, denomination: "gp" },
            description: { value: `<p>Эссенция существа.</p>` }, rarity: essData.id || "common"
          },
          flags: { "hunters-hotpot": { isEssence: true, sourceMonster: ctx.mName } }
        });
      }
      reportItems.push({
        name: finalEssName,
        system: { quantity: 1, weight: { value: 0.1 }, price: { value: essData.p } }
      });
    }

    if (itemsToUpdate.length > 0) await ctx.playerActor.updateEmbeddedDocuments("Item", itemsToUpdate);
    if (itemsToCreate.length > 0) await ctx.playerActor.createEmbeddedDocuments("Item", itemsToCreate);

    return reportItems; // Отдаем отчетному окну сырые данные, чтобы оно не путалось в обновленных стаках
  }

  static sendReport(ctx, items, rollData, usedSlots) {
    const timePerSlot = Math.round(ctx.sizeData.baseMin / ctx.sizeData.s);
    const actualMin = Math.min(ctx.sizeData.baseMin, Math.max(timePerSlot, (usedSlots || 1) * timePerSlot));
    const timeStr = actualMin < 60 ? `${actualMin} мин.` : `${Math.floor(actualMin / 60)} ч. ${actualMin % 60 ? (actualMin % 60) + ' мин.' : ''}`;

    let formula = `1к20[<b>${rollData.baseRoll}</b>]`;
    if (rollData.statMod !== 0) formula += ` ${rollData.statMod > 0 ? '+' : '-'} ${Math.abs(rollData.statMod)}(Хар)`;
    if (rollData.skillBonus !== 0) formula += ` + ${rollData.skillBonus}(Навык)`;
    if (rollData.helpBonus > 0) formula += ` + ${rollData.helpBonus}(Помощь)`;

    const itemsHtml = items.map(i => {
      const q = i.system.quantity || 1;
      const totalW = (i.system.weight.value * q).toFixed(1);
      return `<li style="margin-bottom:4px;">
        <b>${q}x ${i.name}</b><br>
        <span style="opacity: 0.65; font-size:11px;">1шт: ${i.system.weight.value} lb | ${i.system.price.value} зм. (Всего: ${totalW} lb)</span>
      </li>`;
    }).join("");

    const helpersHtml = rollData.helpers && rollData.helpers.length ? `<div style="font-size:11px; color: var(--dnd5e-color-gold, #0ea5e9); margin-top:2px;">Помощники: <b>${rollData.helpers.join(", ")}</b></div>` : '';

    const html = `
        <div style="border: 1px solid var(--color-border-light-tertiary, #cbd5e1); border-radius: 4px; background: var(--dnd5e-color-card-background, rgba(0,0,0,0.02)); padding: 8px; color: inherit;">
            <p style="margin: 0 0 6px;"><b>${ctx.playerActor.name}</b> разделал <i>${ctx.mName}</i>.</p>
            <div style="background: rgba(0,0,0,0.1); padding: 6px; border-radius: 4px; font-size: 13px; margin-bottom: 8px; border: 1px solid var(--color-border-light-tertiary, #cbd5e1);">
                <div>Итог: <b style="font-size:15px;">${rollData.total}</b> ${rollData.isCrit ? '<span style="color:#10b981;">(КРИТ!)</span>' : ''}</div>
                <div style="font-size:11px; font-family:monospace; opacity: 0.8;">${formula}</div>
                ${helpersHtml}
            </div>
            <ul style="margin:0; padding-left:20px; font-size:13px;">${itemsHtml}</ul>
            <hr style="margin:8px 0; border-color: var(--color-border-light-tertiary, #cbd5e1); opacity: 0.5;">
            <div style="font-size:11px; display:flex; justify-content:space-between; opacity: 0.8;">
                <span>Время: <b>${timeStr}</b></span> <span>Зарядов: <b>-${ctx.sizeData.charge}</b></span>
            </div>
        </div>`;

    ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: ctx.playerActor }), content: html });
  }
}