import { HOTPOT_CONFIG } from "../config.js";
import { HarvestService } from "../services/harvest-service.js";
import { HarvestLootApp } from "./harvest-loot-app.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class HarvestPrepApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "hotpot-harvest-prep",
    classes: ["hunters-hotpot"],
    tag: "form",
    window: { title: "Сбор компонентов: Подготовка", icon: "fas fa-hand-sparkles" },
    position: { width: 380, height: "auto" },
    actions: { toggleHelper: HarvestPrepApp._onToggleHelper },
    form: { handler: function (e, f, d) { this._onSubmit(e, f, d); }, closeOnSubmit: true }
  };

  static PARTS = { form: { template: "modules/hunters-hotpot/templates/harvest-prep.hbs" } };

static async init(playerActor, targetToken) {
    try {
      HarvestService.validateTarget(targetToken);

      const hasFlag = targetToken.actor.getFlag("hunters-hotpot", "isHarvestCompleted");
      const hasEffect = targetToken.actor.effects.some(e => e.name === "Распотрошен" || e.label === "Распотрошен");

      // МАГИЯ ДЛЯ ГМа: Если эффекта нет, но флаг висит -> очищаем флаги базы (ГМ сделал сброс крестиком)
      if (hasFlag && !hasEffect) {
        await targetToken.actor.unsetFlag("hunters-hotpot", "isHarvestCompleted");
        await targetToken.actor.unsetFlag("hunters-hotpot", "harvestSession");
      } 
      // Если же висит клеймо завершения (и эффект на месте) -> блокируем
      else if (hasFlag || hasEffect) {
        throw new Error("Эта туша уже полностью освежевана и обобрана!");
      }

      const mType = targetToken.actor.system.details?.type?.value || "beast";
      const mSize = targetToken.actor.system.traits?.size || "med";
      const sizeData = HOTPOT_CONFIG.sizes[mSize] || HOTPOT_CONFIG.sizes["med"];
      const sKey = HOTPOT_CONFIG.getSkill(mType);

      const ctx = {
        playerActor, targetToken, mName: targetToken.name, mType,
        cr: targetToken.actor.system.details?.cr || 0,
        sizeData, skillInfo: { key: sKey, name: CONFIG.DND5E.skills[sKey]?.label || sKey }
      };

      // ЗАЩИТА ОТ СЕЙВСКАМА: Читаем сохраненную сессию
      const session = targetToken.actor.getFlag("hunters-hotpot", "harvestSession");
      if (session) {
        if (session.actorId !== playerActor.id) {
          throw new Error("Разделку этого существа уже начал другой персонаж!");
        }
        ui.notifications.info("Возвращаемся к прерванному сбору добычи...");
        new HarvestLootApp(ctx, session.rollData, session.essObtained, session.essData).render(true);
        return; // Пропускаем окно броска
      }

      const kit = HarvestService.validateKit(playerActor, sizeData);
      ctx.kit = kit;

      new HarvestPrepApp(ctx).render(true);
    } catch (error) {
      ui.notifications.error(error.message);
    }
  }
  constructor(ctx, options = {}) { super(options); this.ctx = ctx; }

  async _prepareContext() {
    const t = this.ctx.mType;
    const statOptions = [{ value: "dex", label: "Ловкость (Стандартная разделка)" }];
    if (["aberration", "celestial", "elemental", "fey", "fiend"].includes(t)) {
      statOptions.push({ value: "int", label: "Интеллект (Ритуал)" }, { value: "wis", label: "Мудрость (Ритуал)" }, { value: "cha", label: "Харизма (Ритуал)" });
    }
    if (["giant", "construct", "plant"].includes(t)) statOptions.push({ value: "str", label: "Сила (Грубая разделка)" });

    const helpers = canvas.tokens.placeables
      .filter(tok => tok.actor && tok.actor.id !== this.ctx.playerActor.id && tok.document.disposition === 1)
      .map(tok => {
        const pb = tok.actor.system.attributes?.prof || 2;
        const hasProf = (tok.actor.system.skills[this.ctx.skillInfo.key]?.proficient || 0) >= 1;
        return { id: tok.id, name: tok.name, img: tok.document.texture.src, bonus: hasProf ? pb : Math.floor(pb / 2), hasProf };
      }).sort((a, b) => b.bonus - a.bonus);

    return { ctx: this.ctx, targetImg: this.ctx.targetToken.document.texture.src, statOptions, helpers, hasHelpers: helpers.length > 0 };
  }

  static _onToggleHelper(event, target) {
    const form = target.closest("form");
    const contentDiv = form.querySelector(".hh-app-content");
    const maxHelpers = parseInt(contentDiv.dataset.maxHelpers) || 1;
    const isSelected = target.classList.contains("selected");

    if (maxHelpers === 1) {
      form.querySelectorAll(".hh-helper-card").forEach(el => { el.style.borderColor = "#334155"; el.classList.remove("selected"); });
      if (!isSelected) { target.classList.add("selected"); target.style.borderColor = "#10b981"; }
    } else {
      const currentSelected = form.querySelectorAll(".hh-helper-card.selected").length;
      if (!isSelected && currentSelected >= maxHelpers) return ui.notifications.warn(`Максимум помощников: ${maxHelpers}`);
      target.classList.toggle("selected");
      target.style.borderColor = target.classList.contains("selected") ? "#10b981" : "#334155";
    }
    form.querySelector("#hh-h-count").innerText = form.querySelectorAll(".hh-helper-card.selected").length;
  }

  async _onSubmit(event, form, formData) {
    const { stat } = formData.object;
    let helpBonus = 0; let helpersList = [];
    form.querySelectorAll('.hh-helper-card.selected').forEach(el => { helpBonus += parseInt(el.dataset.bonus); helpersList.push(el.dataset.name); });

    const roll = await new Roll("1d20").evaluate();
    const statMod = this.ctx.playerActor.system.abilities[stat]?.mod || 0;
    const pb = this.ctx.playerActor.system.attributes?.prof || 2;
    const skillBonus = (this.ctx.playerActor.system.skills[this.ctx.skillInfo.key]?.proficient || 0) >= 1 ? pb : 0;

    const totalCheck = roll.total + statMod + skillBonus + helpBonus;
    const essData = HOTPOT_CONFIG.getEssence(this.ctx.cr);
    const essObtained = essData && totalCheck >= essData.dc;

    const rollData = { total: totalCheck, isCrit: roll.total === 20, baseRoll: roll.total, statMod, skillBonus, helpBonus, helpers: helpersList };

    const eligible = Object.values(HOTPOT_CONFIG.harvestCategories).filter(data => data.t.includes(this.ctx.mType) && totalCheck >= data.dc);

    // --- НОВОЕ: Немедленно списываем заряды Набора ДО открытия окна лута! ---
    if (this.ctx.kit) {
      await HarvestService.consumeKitCharge(this.ctx.playerActor, this.ctx.kit, this.ctx.sizeData?.charge ?? 1);
    }

    if (eligible.length === 0 && !essObtained) {
      ui.notifications.warn(`Бросок (${totalCheck}) провален. Туша испорчена.`);
      // Запечатываем тушу
      await this.ctx.targetToken.actor.setFlag("hunters-hotpot", "isHarvestCompleted", true); 
      await HarvestService.applyHarvestEffect(this.ctx); // Прячем токен
      return;
    }

    // --- НОВОЕ: Записываем результаты броска во флаг монстра ---
    await this.ctx.targetToken.actor.setFlag("hunters-hotpot", "harvestSession", {
      actorId: this.ctx.playerActor.id,
      rollData,
      essObtained,
      essData
    });

    new HarvestLootApp(this.ctx, rollData, essObtained, essData).render(true);
  }
}