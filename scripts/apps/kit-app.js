import { HOTPOT_CONFIG } from "../config.js";
import { KitService } from "../services/kit-service.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class KitApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "hotpot-kit-app", classes: ["hunters-hotpot"], tag: "form",
    window: { title: "Набор Свежевателя: Обслуживание", icon: "fas fa-toolbox" }, 
    position: { width: 440, height: "auto" },
    form: { handler: function(e, f, d) { this._onSubmit(e, f, d); }, closeOnSubmit: true }
  };

  static PARTS = { form: { template: "modules/hunters-hotpot/templates/kit-repair.hbs" } };

  static async init(actor) {
    if (!actor) return ui.notifications.warn("Выделите токен ремесленника!");
    let kit = actor.items.find(i => i.getFlag("hunters-hotpot", "isKit") || i.name.toLowerCase().includes("набор свежевателя"));
    if (!kit) {
      await KitService.getOrCreateKit(actor);
      return; 
    }
    const materials = KitService.getValidMaterials(actor);
    new KitApp(actor, kit, materials).render(true);
  }

  constructor(actor, kitItem, options = {}) {
    super(options); 
    this.actor = actor; 
    this.kitItem = kitItem;
    this.materials = KitService.getValidMaterials(actor);
  }

  async _prepareContext() {
    const stats = KitService.getStats(this.kitItem);
    const isFull = stats.current >= stats.max;
    const isMaxed = isFull && stats.max >= (HOTPOT_CONFIG.kit?.maxChargesLimit || 100);
    const mode = isFull ? "upgrade" : "repair";
    const missing = isFull ? Math.max(0, (HOTPOT_CONFIG.kit?.maxChargesLimit || 100) - stats.max) : Math.max(0, stats.max - stats.current);
    const repairCost = game.settings.get("hunters-hotpot", "kitRepairCost");
    const loot = this.materials.reduce((acc, i) => {
      const flags = i.flags?.["hunters-hotpot"];
      if (!flags || !flags.craftType) return acc; 

      const w = i.system.weight?.value || 0; 
      const qty = i.system.quantity || 1;
      const cType = flags.craftType;
      const cTag = HOTPOT_CONFIG.craftTags?.[cType] || { icon: "🧩", label: "Сырье" };
      
      
      acc.push({
        id: i.id, 
        name: i.name, // Больше не пишем (x5), так как рядом счетчик
        img: i.img,
        unitW: w, // Вес 1 штуки
        qty: qty, // Размер стака (макс. лимит инпута)
        cLabel: `${cTag.icon} ${cTag.label}`
      });
      return acc;
    }, []);

    return { 
      kitName: this.kitItem ? this.kitItem.name : "Набор свежевателя", 
      uses: stats.current, maxUses: stats.max, missing, isMaxed, mode, 
      costPerCharge: repairCost, loot 
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    // Слушаем ввод цифр или клики по стрелочкам
    this.element.addEventListener("input", (e) => { if (e.target.matches(".mat-qty")) this._updateUI(); });
    this._updateUI();
  }

  _updateUI() {
    const form = this.element;
    const missingEl = form.querySelector("#missing-charges");
    const costEl = form.querySelector("#cost-per-charge");
    const mode = form.querySelector("#app-mode")?.value || "repair";
    if (!missingEl || !costEl) return;
    
    const missing = parseInt(missingEl.value); 
    const costPerCharge = parseFloat(costEl.value);
    
    let totalAuthorizedWeight = 0;
    
    // Собираем то, что игрок ввел руками
    form.querySelectorAll('.mat-qty').forEach(input => { 
      let val = parseInt(input.value) || 0;
      const max = parseInt(input.max);
      
      // Защита от дурака: не даем ввести отрицательное или больше стака
      if (val > max) { val = max; input.value = max; }
      if (val < 0) { val = 0; input.value = 0; }
      
      let uW = parseFloat(input.dataset.unitw) || 0;
      totalAuthorizedWeight += (val * uW); 
    });
    
    // Считаем заряды
    let targetCharges = Math.floor(totalAuthorizedWeight / costPerCharge);
    if (mode !== "upgrade") {
        targetCharges = Math.min(missing, targetCharges);
    }
    
    const curCostDisplay = form.querySelector("#cur-cost");
    const restoredDisplay = form.querySelector("#restored-charges");
    
    if (curCostDisplay) {
      curCostDisplay.innerHTML = `${totalAuthorizedWeight.toFixed(1)} lb`;
      
      // Показываем, сколько фунтов сгорит в пустоту, если игрок закинул слишком много
      const waste = totalAuthorizedWeight - (targetCharges * costPerCharge);
      if (waste > 0 && mode !== "upgrade") {
        curCostDisplay.innerHTML += `<br><span style="color:#ef4444; font-size:10px;">(Потеря: ${waste.toFixed(1)} lb сгорит безвозвратно)</span>`;
      }
    }
    
    if (restoredDisplay) restoredDisplay.innerText = targetCharges;
    
    const btn = form.querySelector("button[type='submit']");
    if (btn) { 
      btn.disabled = targetCharges <= 0; 
      btn.style.opacity = targetCharges > 0 ? "1" : "0.5"; 
    }
  }

async _onSubmit(event, form, formData) {
    const missingEl = form.querySelector("#missing-charges");
    const costEl = form.querySelector("#cost-per-charge");
    if (!missingEl || !costEl) return;

    const mode = form.querySelector("#app-mode").value;
    const costPerCharge = parseFloat(costEl.value);
    
    let totalAuthorizedWeight = 0;
    const selectedItems = [];
    
    form.querySelectorAll('.mat-qty').forEach(input => { 
      let val = parseInt(input.value) || 0;
      if (val > 0) {
          totalAuthorizedWeight += (val * parseFloat(input.dataset.unitw)); 
          selectedItems.push({ id: input.dataset.id, qty: val }); 
      }
    });

    const chargesToProcess = Math.floor(totalAuthorizedWeight / costPerCharge);
    if (chargesToProcess <= 0) return ui.notifications.warn("Недостаточно массы материалов.");

    const result = await KitService.processRepair(this.actor, this.kitItem, selectedItems, chargesToProcess, mode);
    
    const msgTitle = result.mode === "upgrade" ? "📦 Улучшение вместимости" : "🛠️ Обслуживание набора";
    const msgDesc = result.mode === "upgrade" 
      ? `Использовано <b>${result.weightConsumed.toFixed(1)} lb</b> материалов. Добавлены новые колбы. Влезает зарядов: +${result.chargesToAdd}.` 
      : `Использовано <b>${result.weightConsumed.toFixed(1)} lb</b> материалов. Восстановлено: +${result.chargesToAdd}.`;

    // ИСПРАВЛЕНА КАРТОЧКА ЧАТА ДЛЯ ТЕМНОЙ ТЕМЫ
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<div style="border: 1px solid var(--color-border-light-tertiary, #cbd5e1); border-radius: 4px; background: var(--dnd5e-color-card-background, rgba(0,0,0,0.02)); padding: 8px; color: inherit;">
        <h3 style="margin: 0 0 6px; border-bottom: 1px solid var(--color-border-light-tertiary, #cbd5e1); padding-bottom: 4px; font-size: 14px;">${msgTitle}</h3>
        <p style="margin:0; font-size: 13px; opacity: 0.85;">${msgDesc}</p>
      </div>`
    });
  }
}