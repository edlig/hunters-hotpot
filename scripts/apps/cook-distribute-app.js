import { HOTPOT_CONFIG } from "../config.js";
import { CookService } from "../services/cook-service.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class CookDistributeApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "hotpot-distribute", classes: ["hunters-hotpot"], tag: "form",
    window: { title: "Раздача порций", icon: "fas fa-utensils" },
    position: { width: 340, height: "auto" },
    actions: { toggleEater: CookDistributeApp._onToggleEater },
    form: { handler: function (e, f, d) { this._onSubmit(e, f, d); }, closeOnSubmit: true }
  };

  static PARTS = { form: { template: "modules/hunters-hotpot/templates/cook-distribute.hbs" } };

  constructor(ctx, options = {}) { super(options); this.ctx = ctx; this.maxPortions = Math.floor(this.ctx.finalPortions); }

  async _prepareContext() {
    const pcActors = game.actors.filter(a => a.type === "character").sort((a, b) => a.id === this.ctx.cookActor.id ? -1 : b.id === this.ctx.cookActor.id ? 1 : 0);
    const eaters = pcActors.map(a => ({ id: a.id, name: a.name, img: a.img, isCook: a.id === this.ctx.cookActor.id }));
    let effectName = this.ctx.outcome === "ruined" ? "🤢 Испорченная жижа" : this.ctx.recipe.name;
    let effectIcon = this.ctx.outcome === "ruined" ? "icons/consumables/meat/steak-spoiled-yellow.webp" : this.ctx.recipe.img;
    return { ctx: this.ctx, eaters, effectName, effectIcon, maxPortions: this.maxPortions };
  }

  static _onToggleEater(event, target) {
    const form = target.closest("form");
    const container = form.querySelector(".hh-app-content");
    const max = parseInt(container.dataset.max) || 1;
    const checked = form.querySelectorAll(".eater-cb:checked").length;

    if (checked > max) {
      event.preventDefault(); target.checked = false;
      return ui.notifications.warn("Не хватает порций!");
    }
    form.querySelector("#dist-avail").innerText = max - checked;
  }

  async _onSubmit(event, form, formData) {
    const fedIds = []; const fedNames = [];
    form.querySelectorAll('.eater-cb:checked').forEach(cb => { fedIds.push(cb.dataset.id); fedNames.push(cb.dataset.name); });

    await CookService.consumeIngredients(this.ctx.cookActor, this.ctx.selectedItems, this.ctx.requiredWeight, this.ctx.essId);

    const foodEffect = CookService.generateEffectData(this.ctx.outcome, this.ctx.baseType, this.ctx.essData, this.ctx.dmgType, this.ctx.dominantType, this.ctx.specificStat, this.ctx.cookActor);
    const quirkEffect = CookService.generateQuirkEffect(this.ctx.quirk, this.ctx.outcome, this.ctx.cookActor);

    await CookService.applyEffectsToActors(fedIds, foodEffect, quirkEffect);
    const leftovers = this.maxPortions - fedIds.length;
    await CookService.createLeftovers(this.ctx.cookActor, leftovers, foodEffect, quirkEffect, this.ctx.outcome === "ruined");

    let qHtml = "";
    if (this.ctx.outcome === "positive") qHtml = `<div style="background:#dcfce7; color:#166534; padding:4px; border-radius:4px; font-size:11px; margin-bottom:6px;"><b>✨ Причуда: ${this.ctx.quirk.name}</b><br>${this.ctx.quirk.desc}</div>`;
    if (this.ctx.outcome === "negative") qHtml = `<div style="background:#fee2e2; color:#991b1b; padding:4px; border-radius:4px; font-size:11px; margin-bottom:6px;"><b>🤢 Причуда: ${this.ctx.quirk.name}</b><br>${this.ctx.quirk.desc}</div>`;

    const chatHtml = `
<div style="border: 1px solid var(--color-border-light-tertiary, #cbd5e1); border-radius: 4px; background: var(--dnd5e-color-card-background, rgba(0,0,0,0.02)); padding: 8px; color: inherit;">
        <h3 style="margin: 0 0 6px; border-bottom: 1px solid #d97706; display: flex; align-items: center; gap: 8px;">
            <img src="${foodEffect.img}" style="width: 24px; height: 24px; border-radius:4px; border: none;"> 
        ${this.ctx.outcome === "ruined" ? "Стряпня испорчена!" : "Приготовлено: " + this.ctx.recipe.name}
        </h3>
        <div style="font-size: 11px; font-family: monospace; margin-bottom: 6px; color: #92400e;">Проверка: <b>${this.ctx.totalCheck}</b> (СЛ ${this.ctx.baseDC})<br>Формула: ${this.ctx.formulaStr}</div>
        ${this.ctx.outcome === "ruined" ? `<p style="margin: 0 0 6px; font-size: 12px; color:#dc2626;">Ядовитая жижа. Отравление на 1 час.</p>` : `<p style="margin: 0 0 6px; font-size: 12px;"><b>Основа:</b> 
          ${CONFIG.DND5E.damageTypes[this.ctx.dmgType]?.label || this.ctx.dmgType} (${this.ctx.dominantType})<br><b>Эффект:</b> ${this.ctx.recipe.desc}</p>`}        ${qHtml}
        <div style="font-size: 12px; margin-top:8px;">
            <b>Поели:</b> ${fedNames.length > 0 ? fedNames.join(", ") : "<i>Никто не рискнул</i>"}<br>
            <b>Сохранено в инвентарь:</b> ${leftovers} порц.
        </div>
      </div>`;
    ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this.ctx.cookActor }), content: chatHtml });
  }
}