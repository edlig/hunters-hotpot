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

  constructor(ctx, options = {}) {
    super(options);
    this.ctx = ctx;
    this.maxPortions = Math.floor(this.ctx.finalPortions);
  }

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
    const fedIds = [this.ctx.cookActor.id];
    const fedNames = [this.ctx.cookActor.name];

    form.querySelectorAll('.eater-cb:checked').forEach(cb => {
      if (cb.dataset.id !== this.ctx.cookActor.id) {
        fedIds.push(cb.dataset.id);
        fedNames.push(cb.dataset.name);
      }
    });

    // 1. Накладываем эффект на тех, кто ест прямо сейчас
    await CookService.applyEffectsToActors(fedIds, this.ctx.foodEffect);

    // 2. Списываем съеденные порции ИЗ УЖЕ СОЗДАННОЙ стопки в инвентаре
    const leftoverItem = this.ctx.cookActor.items.get(this.ctx.leftoverItemId);
    let leftoversCount = Math.max(0, this.ctx.finalPortions - fedIds.length);
    if (leftoverItem) {
      if (leftoversCount <= 0) {
        await leftoverItem.delete(); // Съели всё
        leftoversCount = 0;
      } else {
        await leftoverItem.update({ "system.quantity": leftoversCount }); // Откусили часть
      }
    }

    // 3. Рисуем чат (используя this.ctx.foodEffect и this.ctx.ingredientsText)
    const isMasterpiece = this.ctx.outcome === "positive";
    const title = this.ctx.outcome === "ruined" ? "Стряпня испорчена!" : isMasterpiece ? `✨ Шедевр: ${this.ctx.recipe.name}` : `Приготовлено: ${this.ctx.recipe.name}`;

    const dmgLabel = CONFIG.DND5E.damageTypes[this.ctx.dmgType]?.label || this.ctx.dmgType;
    const statLabel = CONFIG.DND5E.abilities[this.ctx.specificStat]?.label || this.ctx.specificStat;

    let bonusBadge = "";
    if (this.ctx.outcome !== "ruined") {
      switch (this.ctx.recipe.effectKey) {
        case "maxHp": bonusBadge = `+${5 * this.ctx.essFlat} Макс. ХП`; break;
        case "drElement": bonusBadge = `Снижение урона: ${this.ctx.essFlat} (${dmgLabel})`; break;
        case "bonusDamage": bonusBadge = `Урон: +${this.ctx.essDice} (${dmgLabel})`; break;
        case "bonusChecks": bonusBadge = `Проверки: +${this.ctx.essDice} (${statLabel})`; break;
        case "bonusSaves": bonusBadge = `Спасы: +${this.ctx.essDice} (${statLabel})`; break;
      }
    }

    const chatHtml = `
      <div style="border: 1px solid var(--color-border-light-tertiary, #cbd5e1); border-radius: 4px; background: var(--dnd5e-color-card-background, rgba(0,0,0,0.02)); padding: 8px; color: inherit;">
        <h3 style="margin: 0 0 6px; border-bottom: 1px solid #d97706; display: flex; align-items: center; gap: 8px;">
            <img src="${this.ctx.foodEffect.img}" style="width: 24px; height: 24px; border-radius:4px; border: none;"> 
            ${title}
        </h3>
        <div style="font-size: 11px; font-family: monospace; margin-bottom: 6px; color: #92400e;">Проверка: <b>${this.ctx.totalCheck}</b> (СЛ ${this.ctx.baseDC})<br>Формула: ${this.ctx.formulaStr}</div>
        
        ${this.ctx.outcome === "ruined"
        ? `<p style="margin: 0 0 6px; font-size: 12px; color:#dc2626;">Ядовитая жижа. Отравление на 1 час.</p>`
        : `<p style="margin: 0 0 6px; font-size: 12px;"><b>Ингредиенты:</b> ${this.ctx.ingredientsText}<br><b>Эффект:</b> ${this.ctx.recipe.desc}</p>
             <div style="margin-bottom: 8px;">
               <span style="background: #fef3c7; border: 1px solid #f59e0b; color: #b45309; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold;">
                 Мощность: ${bonusBadge}
               </span>
             </div>`
      }
        
        <div style="font-size: 12px; margin-top:8px;">
            <b>Поели:</b> ${fedNames.length > 0 ? fedNames.join(", ") : "<i>Никто не рискнул</i>"}<br>
            <b>Сохранено в инвентарь:</b> ${leftoversCount} порц.<br>
            ${isMasterpiece ? `<span style="color: #10b981; font-weight: bold;">Эффект сытости длится 16 часов!</span>` : ""}
        </div>
      </div>`;
    ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this.ctx.cookActor }), content: chatHtml });
  }
}