import { HOTPOT_CONFIG } from "../config.js";
import { HarvestService } from "../services/harvest-service.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class HarvestLootApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "hotpot-harvest-loot", classes: ["hunters-hotpot"], tag: "form",
    window: { title: "Сбор компонентов", icon: "fas fa-cut" }, position: { width: 480, height: "auto" },
    form: { handler: function(e, f, d) { this._onSubmit(e, f, d); }, closeOnSubmit: true }
  };

  static PARTS = { form: { template: "modules/hunters-hotpot/templates/harvest-loot.hbs" } };

  constructor(ctx, rollData, essObtained, essData, options = {}) {
    super(options); this.ctx = ctx; this.rollData = rollData; this.essObtained = essObtained; this.essData = essData;
  }

  async _prepareContext() {
    const crMult = HOTPOT_CONFIG.getCrMult(this.ctx.cr);
    const priceMod = this.rollData.isCrit ? 2 : 1;
    const maxSlots = this.ctx.sizeData.s;
    const sizeMult = this.ctx.sizeData.mWeight || 1; 
    
    // БАЛАНС: Считываем настройку множителя количества добычи
    const yieldMult = game.settings.get("hunters-hotpot", "harvestYieldMultiplier");
    const yieldPerSlot = Math.max(1, Math.floor(Math.pow(2, this.ctx.sizeData.s - 3) * yieldMult));
    this.ctx.yieldPerSlot = yieldPerSlot;
    
    const availableCategories = [];
    
    for (const [key, data] of Object.entries(HOTPOT_CONFIG.harvestCategories)) {
      if (!data.t.includes(this.ctx.mType)) continue;
      if (this.rollData.total < data.dc) continue;

      const piecePrice = Number((data.p * crMult * priceMod).toFixed(2));
      const cTag = HOTPOT_CONFIG.craftTags[data.cType];
      const rows = [];

      if (data.u) {
        const totalW = Number((data.w * sizeMult).toFixed(2)); 
        const slotsReq = Math.max(1, Math.ceil(totalW / 200)); 
        
        const maxPossibleOrgans = Math.floor(maxSlots / slotsReq);
        const rowCount = Math.max(1, Math.min(5, maxPossibleOrgans || 1)); 

        for (let i = 0; i < rowCount; i++) {
          rows.push({
            idx: i, isFirst: i === 0,
            w: totalW, p: piecePrice, baseDc: data.dc,
            categoryId: key, slotsReq: slotsReq, isIndivisible: true
          });
        }
      } else {
        const rowCount = Math.min(maxSlots, 5); 
        for (let i = 0; i < rowCount; i++) {
          rows.push({
            idx: i, isFirst: i === 0,
            w: Number(data.w.toFixed(2)), p: piecePrice, baseDc: data.dc,
            categoryId: key, slotsReq: 1, isIndivisible: false
          });
        }
      }

      availableCategories.push({
        id: key, label: data.label, dc: data.dc, img: data.img,
        cIcon: cTag?.icon || "🧩", cLabel: cTag?.label || "Сырье",
        presets: data.presets, isUnique: key === "unique", rows
      });
    }

    availableCategories.sort((a, b) => a.dc - b.dc);
    return { ctx: this.ctx, rollData: this.rollData, essObtained: this.essObtained, essData: this.essData, categories: availableCategories };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.addEventListener("change", (e) => {
      if (e.target.classList.contains("hh-preset-sel")) {
        const row = e.target.closest(".hh-li");
        const customInp = row.querySelector(".hh-custom-val");
        if (e.target.value === "custom") { customInp.style.display = "block"; customInp.required = true; } 
        else { customInp.style.display = "none"; customInp.required = false; }
      }
      
      if (e.target.classList.contains("cb-slot")) {
        this._onToggleSlot(e, e.target);
      }
    });
  }

  _onToggleSlot(event, target) {
    const form = target.closest("form");
    const maxSlots = this.ctx.sizeData.s;
    
    let totalUsedSlots = 0;
    form.querySelectorAll(".cb-slot:checked").forEach(cb => {
      totalUsedSlots += parseInt(cb.dataset.slots) || 1;
    });

    const neededSlots = parseInt(target.dataset.slots) || 1;

    if (target.checked && totalUsedSlots > maxSlots) {
      event.preventDefault(); 
      target.checked = false;
      totalUsedSlots = 0;
      form.querySelectorAll(".cb-slot:checked").forEach(cb => totalUsedSlots += parseInt(cb.dataset.slots) || 1);
      return ui.notifications.warn(`Не хватает слотов! Этот кусок требует ${neededSlots} слота(ов).`);
    }

    const row = target.closest(".hh-li");
    const group = row.closest(".hh-cat-group");
    if (target.checked) {
      const nextHidden = group.querySelector(".hh-cascade-row.hidden-row");
      if (nextHidden) { 
        nextHidden.classList.remove("hidden-row"); 
        nextHidden.style.display = "flex"; 
      }
    }

    const counterDisplay = form.querySelector("#hh-used");
    if (counterDisplay) {
      counterDisplay.innerText = totalUsedSlots;
      counterDisplay.style.color = totalUsedSlots >= maxSlots ? "#ef4444" : "#10b981";
    }
  }

async _onSubmit(event, form, formData) {
    const submitBtn = form.querySelector("#submit-btn");
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Сбор...';
    }

    try {
        const selections = [];
        const yieldPerSlot = this.ctx.yieldPerSlot;

        form.querySelectorAll(".cb-slot:checked").forEach(cb => {
          const row = cb.closest(".hh-li");
          const catId = row.dataset.cat;
          const catData = HOTPOT_CONFIG.harvestCategories[catId];
          
          let finalName = catId === "unique" ? (row.querySelector(".hh-custom-val").value || "Неопознанная часть") : row.querySelector(".hh-preset-sel").value;
          if (finalName === "custom") finalName = row.querySelector(".hh-custom-val").value || "Часть туши";

          const finalQuantity = catData.u ? 1 : yieldPerSlot;

          selections.push({
            id: foundry.utils.randomID(),
            name: `${finalName} (${this.ctx.mName})`,
            img: catData.img, dc: catData.dc,
            w: parseFloat(cb.dataset.w), p: parseFloat(cb.dataset.p),
            slots: parseInt(cb.dataset.slots) || 1,
            q: finalQuantity, 
            base: catData.cookBase, cType: catData.cType, u: catData.u,
            sType: this.ctx.mType
          });
        });

        if (selections.length === 0 && !this.essObtained) throw new Error("Вы ничего не собрали!");

        const createdItems = await HarvestService.generateLoot(this.ctx, selections, this.rollData, this.essObtained, this.essData);
        await HarvestService.applyHarvestEffect(this.ctx); 
        HarvestService.sendReport(this.ctx, createdItems, this.rollData, selections.length);
        ui.notifications.info("Сбор успешно завершен!");

    } catch (error) { 
        ui.notifications.error(error.message);
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-cut"></i> Забрать трофеи';
        }
    }
  }
}