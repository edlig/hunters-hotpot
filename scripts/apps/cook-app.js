import { HOTPOT_CONFIG } from "../config.js";
import { CookDistributeApp } from "./cook-distribute-app.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class CookApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "hotpot-cook", classes: ["hunters-hotpot"], tag: "form",
    window: { title: "Полевая Кухня: Готовка", icon: "fas fa-fire" },
    position: { width: 440, height: "auto" },
    actions: { toggleHelper: CookApp._onToggleHelper },
    form: { handler: function (e, f, d) { this._onSubmit(e, f, d); }, closeOnSubmit: true }
  };

  static PARTS = { form: { template: "modules/hunters-hotpot/templates/cook-pot.hbs" } };

  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;

    const harvestItems = this.actor.items.filter(i => i.flags["hunters-hotpot"] && !i.flags["hunters-hotpot"].isEssence && i.flags["hunters-hotpot"].cookBase);
    this.essences = this.actor.items.filter(i => i.flags["hunters-hotpot"]?.isEssence);
    this.groups = {};

    harvestItems.forEach(i => {
      const cookBase = i.flags["hunters-hotpot"].cookBase;
      if (!cookBase || cookBase === "spice") return;

      for (const [rKey, rData] of Object.entries(HOTPOT_CONFIG.recipes.tier1)) {
        if (rData.reqBase === cookBase || cookBase === "any") {
          if (!this.groups[rKey]) this.groups[rKey] = [];
          this.groups[rKey].push(i);
        }
      }
    });
  }

  async _prepareContext() {
    const helpers = game.actors.filter(a => a.type === "character" && a.id !== this.actor.id).map(a => ({ id: a.id, name: a.name, img: a.img, bonus: a.system.attributes?.prof || 2 }));
    const typeOptions = Object.keys(this.groups).map(k => ({ key: k, label: `${HOTPOT_CONFIG.recipes.tier1[k].name} (${this.groups[k].length} стаков)` }));

    const essencesList = this.essences.map(e => {
      const sysRarity = e.system?.rarity || "common";
      return {
        id: e.id,
        name: e.name,
        rarity: HOTPOT_CONFIG.essenceScaling[sysRarity]?.label || "Без эссенции"
      };
    });

    const formattedGroups = {};
    for (const [key, items] of Object.entries(this.groups)) {
      formattedGroups[key] = items.map(i => {
        const q = i.system.quantity || 1;
        const w = (i.system.weight?.value || 0) * q;
        const isU = i.flags["hunters-hotpot"].slotsUsed > 1 || w >= 200 || ["Сердце", "Печень", "Глаз", "Мозг", "Яйцо"].some(n => i.name.includes(n));

        return {
          id: i.id,
          name: q > 1 ? `${i.name} (x${q})` : i.name,
          img: i.img,
          w: Number(w.toFixed(2)),
          isU,
          type: i.flags["hunters-hotpot"].sourceType || "beast"
        };
      });
    }
    return { helpers, hasHelpers: helpers.length > 0, typeOptions, essencesList, groups: formattedGroups };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this._updatePotUI();
  }

  _onChangeForm(formConfig, event) {
    this._updatePotUI();
  }

  _updatePotUI() {
    const form = this.element;
    const baseTypeEl = form.querySelector("#base-type");
    if (!baseTypeEl) return;

    const baseType = baseTypeEl.value;
    const reqPortions = parseInt(form.querySelector("#portions-inp").value) || 1;

    const weightPerPortion = game.settings.get("hunters-hotpot", "cookPortionWeight");
    const requiredWeight = reqPortions * weightPerPortion;

    const twEl = form.querySelector("#target-weight");
    if (twEl) twEl.innerText = `${requiredWeight} lb (${reqPortions} порц.)`;

    form.querySelectorAll(".ing-group").forEach(el => el.style.display = "none");
    const activeGroup = form.querySelector(`.ing-group[data-group="${baseType}"]`);
    if (activeGroup) activeGroup.style.display = "block";

    let curWeight = 0;
    if (activeGroup) {
      activeGroup.querySelectorAll('.ing-cb:checked').forEach(cb => {
        const w = parseFloat(cb.dataset.w);
        if (cb.dataset.u === "true") curWeight += w;
        else curWeight += Math.min(w, requiredWeight - curWeight > 0 ? requiredWeight - curWeight : 0);
      });
    }

    const potEl = form.querySelector("#pot-weight");
    if (potEl) {
      potEl.innerText = curWeight.toFixed(1);
      potEl.style.color = curWeight >= requiredWeight ? "#10b981" : "#ef4444";
    }
  }

  static _onToggleHelper(event, target) {
    const form = target.closest("form");
    const isSelected = target.classList.contains("selected");
    form.querySelectorAll(".hh-helper-card").forEach(el => { el.classList.remove("selected"); el.style.borderColor = "#334155"; });
    const nameSpan = form.querySelector("#helper-name");

    if (!isSelected) {
      target.classList.add("selected");
      target.style.borderColor = "#10b981";
      nameSpan.innerText = `${target.dataset.name} (+${target.dataset.bonus})`;
    } else {
      nameSpan.innerText = "Не выбран";
    }
    form.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async _onSubmit(event, form, formData) {
    const { baseType, portions, essId } = formData.object;
    const reqPortions = parseInt(portions) || 1;
    
    // БАЛАНС: Считываем настройку веса порции из настроек мира
    const weightPerPortion = game.settings.get("hunters-hotpot", "cookPortionWeight");
    const requiredWeight = reqPortions * weightPerPortion;

    let helperBonus = 0;
    const selHelper = form.querySelector('.hh-helper-card.selected');
    if (selHelper) helperBonus = parseInt(selHelper.dataset.bonus);

    const selected = [];
    const activeGroup = form.querySelector(`.ing-group[data-group="${baseType}"]`);
    if (activeGroup) {
      activeGroup.querySelectorAll('.ing-cb:checked').forEach(cb => {
        selected.push({ id: cb.dataset.id, w: parseFloat(cb.dataset.w), u: cb.dataset.u === "true", type: cb.dataset.type });
      });
    }

    if (selected.length === 0) return ui.notifications.warn("Выберите ингредиенты!");

    const totalAvail = selected.reduce((sum, s) => sum + s.w, 0);
    if (requiredWeight > totalAvail) return ui.notifications.error(`Недостаточно веса! Выбрано ${totalAvail.toFixed(1)} фт, нужно ${requiredWeight} фт.`);

    const hasCookUtensils = this.actor.items.some(i => i.name.toLowerCase().includes("повар") || i.name.toLowerCase().includes("кулинар"));
    const baseDC = 12;
    const conMod = this.actor.system.abilities.con?.mod || 0;
    const pb = hasCookUtensils ? (this.actor.system.attributes?.prof || 2) : 0;
    const roll = await new Roll("1d20").evaluate({ async: true });
    const totalCheck = roll.total + conMod + pb + helperBonus;

    let outcome = "normal", quirk = null;
    if (totalCheck <= baseDC - 13) { outcome = "ruined"; }
    else if (roll.total === 20 || totalCheck >= baseDC + 5) { outcome = "positive"; quirk = HOTPOT_CONFIG.quirks.positive[Math.floor(Math.random() * 8)]; }
    else if (totalCheck < baseDC) { outcome = "negative"; quirk = HOTPOT_CONFIG.quirks.negative[Math.floor(Math.random() * 8)]; }

    let essData = HOTPOT_CONFIG.essenceScaling["common"];
    if (essId !== "none") {
      const eItem = this.actor.items.get(essId);
      const sysRarity = eItem.system?.rarity || "common";
      essData = HOTPOT_CONFIG.essenceScaling[sysRarity] || essData;
    }

    let typeWeights = {};
    let targetW = requiredWeight;

    selected.sort((a, b) => (a.u === b.u ? a.w - b.w : a.u ? -1 : 1));
    for (let s of selected) {
      if (targetW <= 0) break;
      const take = s.u ? s.w : Math.min(targetW, s.w);
      targetW -= take;
      typeWeights[s.type] = (typeWeights[s.type] || 0) + take;
    }

    const finalPortions = targetW < 0 ? reqPortions + Math.floor(Math.abs(targetW) / weightPerPortion) : reqPortions;
    let dominantType = Object.keys(typeWeights).reduce((a, b) => typeWeights[a] > typeWeights[b] ? a : b);

    const formulaStr = `1к20[<b>${roll.total}</b>] ${conMod >= 0 ? '+' + conMod : conMod}(Тел) ${pb > 0 ? '+' + pb + '(Инстр.)' : ''} ${helperBonus > 0 ? '+' + helperBonus + '(Помощь)' : ''}`;

    const ctx = {
      cookActor: this.actor, outcome, baseType, recipe: HOTPOT_CONFIG.recipes.tier1[baseType],
      essData, dmgType: HOTPOT_CONFIG.damageMapping[dominantType] || "fire", dominantType, specificStat: HOTPOT_CONFIG.statMapping[dominantType] || "con",
      finalPortions, quirk, totalCheck, baseDC, formulaStr, selectedItems: selected, reqPortions, requiredWeight, essId
    };

    new CookDistributeApp(ctx).render(true);
  }
}