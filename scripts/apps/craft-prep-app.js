import { HOTPOT_CONFIG } from "../config.js";
import { CraftService } from "../services/craft-service.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class CraftPrepApp extends HandlebarsApplicationMixin(ApplicationV2) {
static DEFAULT_OPTIONS = {
    id: "hotpot-craft-prep", classes: ["hunters-hotpot"], tag: "form",
    window: { frame: true, positioned: true, title: "Ремесленный Верстак", icon: "fas fa-hammer" },
    position: { width: 560, height: 620 },
    form: { handler: function (e, f, d) { this._onSubmit(e, f, d); }, closeOnSubmit: true }
  };

  static PARTS = { form: { template: "modules/hunters-hotpot/templates/craft-prep.hbs" } };

  constructor(actor, incomingData = null, options = {}) {
    super(options);
    this.actor = actor;
    this.incomingData = incomingData; 
    this._searchTimeout = null;

    this.harvestItems = this.actor.items.filter(i => i.flags["hunters-hotpot"] && !i.flags["hunters-hotpot"].isEssence && (i.flags["hunters-hotpot"].craftType || i.flags["hunters-hotpot"].componentId));
    this.essences = this.actor.items.filter(i => i.flags["hunters-hotpot"]?.isEssence);
  }

  async _prepareContext() {
    const loot = this.harvestItems.map(i => {
      const p = i.system.price?.value || 0;
      const qty = i.system.quantity || 1;
      const flags = i.flags["hunters-hotpot"];
      const cTag = HOTPOT_CONFIG.craftTags?.[flags.craftType];

      return {
        id: i.id, name: i.name, img: i.img,
        unitP: p, qty: qty,
        u: flags.slotsUsed > 1, cType: flags.craftType, sType: flags.sourceType || "any",
        cLabel: cTag ? `${cTag.icon} ${cTag.label}` : ""
      };
    });
    return { loot };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const el = this.element;

    // НАДЕЖНОЕ ЦЕНТРИРОВАНИЕ ОКНА V2 НА ЭКРАНЕ
    requestAnimationFrame(() => {
        if (el) {
            el.style.left = `${Math.max(0, (window.innerWidth - el.offsetWidth) / 2)}px`;
            el.style.top = `${Math.max(0, (window.innerHeight - el.offsetHeight) / 2)}px`;
        }
    });

    this._initStaticDropdowns();
    this._populateRecipes();

    if (this.incomingData) {
      if (this.incomingData.recipeId && HOTPOT_CONFIG.crafting.recipes[this.incomingData.recipeId]) {
        el.querySelector("#recipe-sel").value = this.incomingData.recipeId;
      } else {
        const bestRecipeEntry = Object.entries(HOTPOT_CONFIG.crafting.recipes || {}).find(([id, r]) => {
          return (r.reqTags.includes(this.incomingData.cType) || this.incomingData.cType === "any") && (r.reqType === "any" || r.reqType === this.incomingData.sType);
        });
        if (bestRecipeEntry) el.querySelector("#recipe-sel").value = bestRecipeEntry[0];
      }
    }

    this._updateCraftUI();

    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.tagName === "INPUT") e.preventDefault();
    });

    el.addEventListener("change", (e) => {
      if (e.target.matches("#rarity-filter, #cat-filter, #available-filter")) {
        this._populateRecipes(false);
        this._updateCraftUI();
      } else if (e.target.matches("#recipe-sel, #essence-sel")) {
        this._updateCraftUI();
      }
    });

    el.addEventListener("input", (e) => {
      if (e.target.matches("#recipe-search")) {
        if (this._searchTimeout) clearTimeout(this._searchTimeout);
        this._searchTimeout = setTimeout(() => {
          this._populateRecipes(true);
          this._updateCraftUI();
        }, 250);
      } else if (e.target.matches(".mat-qty, #batch-qty-inp")) {
        this._updateCraftUI();
      }
    });
  }

  _initStaticDropdowns() {
    const rSel = this.element.querySelector("#rarity-filter");
    const cSel = this.element.querySelector("#cat-filter");
    const config = HOTPOT_CONFIG.crafting || {};

    rSel.add(new Option("Все редкости", "all"));
    Object.entries(config.rarity || {}).forEach(([k, v]) => rSel.add(new Option(v.label, k)));
    cSel.add(new Option("Все категории", "all"));
    Object.entries(config.categories || {}).forEach(([k, v]) => cSel.add(new Option(v.label, k)));
  }

  _calculateTargetCost(recipe) {
    if (!recipe) return 0;
    const rarityData = HOTPOT_CONFIG.crafting.rarity[recipe.rarity];
    if (!rarityData) return 0;
    
    const costMult = game.settings.get("hunters-hotpot", "craftCostMultiplier") ?? 1;
    let cost = (rarityData.rawCost || 0) * costMult;
    if (recipe.category === "potion" || recipe.isConsumable) cost = Math.max(1, Math.floor(cost / 2));
    return cost;
  }

  _canCraft(recipe) {
    const reqTier = HOTPOT_CONFIG.crafting.rarity[recipe.rarity]?.tier || 0;
    if (reqTier > 0) {
      const hasEssence = this.essences.some(e => (HOTPOT_CONFIG.crafting.rarity[e.system?.rarity || "common"]?.tier || 0) >= reqTier);
      if (!hasEssence) return false;
    }

    let availableValue = 0;
    const availableTags = new Set();

    this.harvestItems.forEach(i => {
      const flags = i.flags["hunters-hotpot"];
      const cType = flags.craftType;
      const sType = flags.sourceType || "any";
      
      const isValidType = recipe.reqTags.includes(cType) || cType === "any";
      const isPerfectMatch = recipe.reqType === "any" || recipe.reqType === sType;

      if (isValidType && isPerfectMatch) {
        availableValue += (i.system.price?.value || 0) * (i.system.quantity || 1);
        availableTags.add(cType);
      }
    });

    if (availableValue < this._calculateTargetCost(recipe)) return false;
    return recipe.reqTags.every(tag => availableTags.has(tag) || availableTags.has("any"));
  }

  _populateRecipes(preserveSelection = false) {
    const search = this.element.querySelector("#recipe-search").value.toLowerCase();
    const rKey = this.element.querySelector("#rarity-filter").value;
    const cKey = this.element.querySelector("#cat-filter").value;
    const showOnlyAvailable = this.element.querySelector("#available-filter").checked;
    
    const recSel = this.element.querySelector("#recipe-sel");
    const currentVal = recSel.value;
    recSel.innerHTML = "";

    let hasMatch = false;
    Object.entries(HOTPOT_CONFIG.crafting.recipes || {}).forEach(([id, r]) => {
      const matchSearch = !search || r.name.toLowerCase().includes(search);
      const matchRarity = rKey === "all" || r.rarity === rKey;
      const matchCat = cKey === "all" || r.category === cKey;
      
      if (matchSearch && matchRarity && matchCat) {
        const canCraft = this._canCraft(r);
        if (showOnlyAvailable && !canCraft) return;

        const rarityLabel = HOTPOT_CONFIG.crafting.rarity[r.rarity]?.label || '';
        const prefix = canCraft ? "✅ " : "";
        recSel.add(new Option(`${prefix}${r.name} (${rarityLabel})`, id));
        hasMatch = true;
      }
    });

    if (!hasMatch) recSel.add(new Option("Нет подходящих чертежей", ""));
    else if (preserveSelection && Array.from(recSel.options).some(o => o.value === currentVal)) recSel.value = currentVal;
  }

  _updateCraftUI() {
    const form = this.element;
    const recSel = form.querySelector("#recipe-sel");
    const activeRecipe = HOTPOT_CONFIG.crafting.recipes?.[recSel.value];
    
    const customInp = form.querySelector("#custom-name-inp");
    if (activeRecipe && activeRecipe.isCustom) {
      if (customInp.style.display !== "block") {
        customInp.style.display = "block"; customInp.required = true; customInp.focus();
      }
    } else {
      customInp.style.display = "none"; customInp.required = false;
    }

    let batchQty = 1;
    const batchContainer = form.querySelector("#batch-qty-container");
    const batchInp = form.querySelector("#batch-qty-inp");
    if (activeRecipe && (activeRecipe.category === "potion" || activeRecipe.isConsumable)) {
        batchContainer.style.display = "flex";
        batchQty = parseInt(batchInp.value) || 1;
    } else {
        batchContainer.style.display = "none";
    }

    const reqDisplay = form.querySelector("#req-display");
    if (activeRecipe) {
        reqDisplay.style.display = "block";
        const tagsTranslated = activeRecipe.reqTags.map(t => HOTPOT_CONFIG.craftTags[t]?.label || t);
        const tagsHtml = tagsTranslated.join("</span> и <span style='font-weight:bold;'>");
        
        const tMap = {
            any: "Любое существо", beast: "Зверь", dragon: "Дракон", aberration: "Аберрация",
            monstrosity: "Монстр", undead: "Нежить", fey: "Фея", fiend: "Исчадие",
            elemental: "Элементаль", construct: "Конструкт", plant: "Растение",
            ooze: "Слизь", giant: "Великан", celestial: "Небожитель", humanoid: "Гуманоид"
        };
        const rType = tMap[activeRecipe.reqType] || activeRecipe.reqType;

        reqDisplay.innerHTML = `
            <div style="margin-bottom:4px;"><span style="opacity: 0.7;">Требуемые компоненты:</span> <span style="font-weight:bold;">${tagsHtml}</span></div>
            <div><span style="opacity: 0.7;">Происхождение:</span> <span style="font-weight:bold;">${rType}</span></div>
        `;
    } else {
        reqDisplay.style.display = "none";
    }

    let targetCost = 0; let validEssences = 0;
    const essSel = form.querySelector("#essence-sel");
    const essWarn = form.querySelector("#essence-warning");
    essSel.innerHTML = "";

    if (activeRecipe) {
      const activeRarityData = HOTPOT_CONFIG.crafting.rarity[activeRecipe.rarity] || HOTPOT_CONFIG.crafting.rarity.common;
      const reqTier = activeRarityData.tier || 0;
      recSel.style.borderColor = activeRarityData.color || "var(--color-border-light-tertiary)";
      targetCost = this._calculateTargetCost(activeRecipe) * batchQty;
      form.querySelector("#desc-display").innerText = activeRecipe.desc || "";
      
      if (reqTier === 0) {
        essSel.add(new Option("Без эссенции (Обычный предмет)", "none"));
        essSel.style.display = "block"; essWarn.style.display = "none"; validEssences = 1;
      } else {
        this.essences.forEach(e => {
          const sysRarity = e.system?.rarity || "common";
          const eData = HOTPOT_CONFIG.crafting.rarity[sysRarity];
          if (eData && eData.tier >= reqTier) {
            essSel.add(new Option(`${e.name} (${eData.label})`, e.id)); validEssences++;
          }
        });
        if (validEssences > 0) {
          essSel.style.display = "block"; essWarn.style.display = "none";
        } else {
          essSel.style.display = "none"; essWarn.style.display = "block";
          essWarn.innerText = `Нужна эссенция мощи "${activeRarityData.label}" или выше!`;
        }
      }
    } else {
      recSel.style.borderColor = "var(--color-border-light-tertiary)";
      form.querySelector("#desc-display").innerText = "Рецепт не найден.";
      essSel.style.display = "none"; essWarn.style.display = "none";
    }
    
    const targetCostEl = form.querySelector("#target-cost");
    if (targetCostEl) targetCostEl.innerText = targetCost;

    let curCost = 0;
    const selectedTags = new Set(); 

    form.querySelectorAll('.loot-row').forEach(row => {
      const input = row.querySelector('.mat-qty');
      if (!activeRecipe) { row.style.display = "none"; input.value = 0; return; }

      const cType = row.dataset.ctype;
      const sType = row.dataset.stype;

      const isValidType = activeRecipe.reqTags.includes(cType) || cType === "any";
      const isPerfectMatch = activeRecipe.reqType === "any" || activeRecipe.reqType === sType;

      if (isValidType && isPerfectMatch) {
        row.style.display = "flex";
        input.disabled = false;

        if (this.incomingData && input.dataset.id === this.incomingData.itemId && !this._initialCheckDone) {
          input.value = 1;
        }

        let val = parseInt(input.value) || 0;
        let max = parseInt(input.max) || 1;
        if (val > max) { val = max; input.value = max; }
        if (val < 0) { val = 0; input.value = 0; }

        if (val > 0) {
          row.style.order = 0; 
          row.style.background = "rgba(16, 185, 129, 0.1)"; 
          row.style.borderColor = "#10b981";
          curCost += val * parseFloat(input.dataset.unitp);
          selectedTags.add(cType);
        } else {
          row.style.order = 1; 
          row.style.background = "transparent"; 
          row.style.borderColor = "var(--color-border-light-tertiary, #cbd5e1)";
        }
      } else {
        row.style.display = "none"; input.value = 0;
      }
    });

    this._initialCheckDone = true;

    let missingTags = [];
    if (activeRecipe) {
      activeRecipe.reqTags.forEach(tag => {
        if (!selectedTags.has(tag) && !selectedTags.has("any")) {
          missingTags.push(HOTPOT_CONFIG.craftTags?.[tag]?.label || tag);
        }
      });
    }
    const hasAllTags = missingTags.length === 0;

    const missingWarningEl = form.querySelector("#missing-tags-warning");
    if (activeRecipe && !hasAllTags && curCost > 0) {
      missingWarningEl.style.display = "block";
      missingWarningEl.innerText = `Добавьте компоненты типа: ${missingTags.join(", ")}`;
    } else {
      missingWarningEl.style.display = "none";
    }

    const curCostEl = form.querySelector("#cur-cost");
    const submitBtn = form.querySelector("#submit-btn");

    if (curCostEl) {
      curCostEl.innerText = curCost.toFixed(1);
      const waste = curCost - targetCost;
      if (waste > 0 && activeRecipe) {
        curCostEl.innerHTML += ` <span style="color:#ef4444; font-size:11px;">(Перерасход: ${waste.toFixed(1)} зм)</span>`;
      }
      curCostEl.style.color = curCost >= targetCost ? "#10b981" : "#ef4444";
    }

    const isReady = activeRecipe && curCost >= targetCost && validEssences > 0 && hasAllTags;
    if (submitBtn) {
      submitBtn.disabled = !isReady;
      submitBtn.style.opacity = isReady ? "1" : "0.5";
      submitBtn.style.background = isReady ? "#10b981" : "var(--color-border-dark)";
    }
  }

  async _onSubmit(event, form, formData) {
    const recipeId = form.querySelector("#recipe-sel").value;
    const essId = form.querySelector("#essence-sel").value;
    if (!recipeId) return;

    let activeRecipe = HOTPOT_CONFIG.crafting.recipes[recipeId];
    
    if (activeRecipe.isCustom) {
      const customName = form.querySelector("#custom-name-inp").value;
      if (customName) {
        activeRecipe = foundry.utils.deepClone(activeRecipe);
        activeRecipe.name = customName;
      }
    }

    const rarity = activeRecipe.rarity;
    const category = activeRecipe.category;
    
    const batchQty = (category === "potion" || activeRecipe.isConsumable) ? (parseInt(form.querySelector("#batch-qty-inp").value) || 1) : 1;
    const reqCost = this._calculateTargetCost(activeRecipe) * batchQty;

    const selected = [];
    form.querySelectorAll('.mat-qty').forEach(input => {
      let val = parseInt(input.value) || 0;
      if (val > 0) selected.push({ id: input.dataset.id, qty: val });
    });

    await CraftService.startCraftingProject(this.actor, category, rarity, essId, selected, reqCost, activeRecipe, batchQty);
    ui.notifications.info(`Проект "${activeRecipe.name}" начат! Заготовка добавлена в инвентарь.`);
  }
}