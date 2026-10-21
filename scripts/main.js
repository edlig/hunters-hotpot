import { HOTPOT_CONFIG } from "./config.js";
import { CookApp } from "./apps/cook-app.js";
import { HarvestPrepApp } from "./apps/harvest-prep-app.js";
import { KitApp } from "./apps/kit-app.js";
import { CraftPrepApp } from "./apps/craft-prep-app.js";
import { CraftWorkApp } from "./apps/craft-work-app.js";
import { registerSettings } from "./settings.js";

// Создаем API заранее
const HuntersHotpotAPI = {
  cook: (actor) => {
    const a = actor || canvas.tokens.controlled[0]?.actor || game.user.character;
    if (!a) return ui.notifications.warn("Выделите токен повара!");
    new CookApp(a).render(true);
  },
  harvest: (actor) => {
    const a = actor || canvas.tokens.controlled[0]?.actor || game.user.character;
    if (!a) return ui.notifications.warn("Выделите токен охотника!");
    const targets = Array.from(game.user.targets);
    if (targets.length !== 1) return ui.notifications.warn("Возьмите в таргет ровно один труп!");
    HarvestPrepApp.init(a, targets[0]);
  },
  repairKit: (actor) => {
    const a = actor || canvas.tokens.controlled[0]?.actor || game.user.character;
    if (!a) return ui.notifications.warn("Выделите токен ремесленника!");
    KitApp.init(a);
  },
  craftPrep: (actor, incomingData = null) => {
    const a = actor || canvas.tokens.controlled[0]?.actor || game.user.character;
    if (!a) return ui.notifications.warn("Выделите токен ремесленника!");
    new CraftPrepApp(a, incomingData).render(true);
  },
  craftWork: (actor, wipItem) => {
    const a = actor || canvas.tokens.controlled[0]?.actor || game.user.character;
    if (!a) return ui.notifications.warn("Выделите токен ремесленника!");
    new CraftWorkApp(a, wipItem).render(true);
  }
};

Hooks.once("ready", async () => {
    async function loadRecipes() {
        try {
            const response = await fetch("modules/hunters-hotpot/data/recipes.json");
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            
            const data = await response.json();
            if (data && Object.keys(data).length > 0) {
                HOTPOT_CONFIG.crafting.recipes = foundry.utils.mergeObject(HOTPOT_CONFIG.crafting.recipes || {}, data);
            }
        } catch (e) {
            console.warn("Hunters Hotpot | Не удалось загрузить внешний recipes.json. Используются встроенные чертежи.", e);
        } finally {
            HOTPOT_CONFIG._isLoaded = true;
        }
    }
    loadRecipes();
});

// Привязываем API
window.HuntersHotpot = HuntersHotpotAPI;

Hooks.once("init", () => {
  console.log("Hunter's Hotpot | Инициализация модуля...");
  const module = game.modules.get("hunters-hotpot");
  if (module) module.api = HuntersHotpotAPI;
  registerSettings();
});

// ==========================================
// УНИВЕРСАЛЬНЫЙ ПЕРЕХВАТЧИК ИСПОЛЬЗОВАНИЯ ПРЕДМЕТОВ
// ==========================================
function handleItemUse(item) {
    const flags = item.flags?.["hunters-hotpot"];
    if (!flags) return true; // Обычный предмет, пропускаем

    // 1. Кликнули по Набору Свежевателя
    if (flags.isKit) {
        const targets = game.user.targets;
        if (targets.size !== 1) {
            ui.notifications.warn("Hunters Hotpot | Выберите ровно одну мертвую цель для разделки!");
            return false;
        }
        window.HuntersHotpot.harvest(item.actor);
        return false; // Блокируем чат
    }

    // 2. Кликнули по Заготовке (Крафт)
    if (flags.isWIP) {
        window.HuntersHotpot.craftWork(item.actor, item);
        return false; // Блокируем чат
    }

    return true;
}

Hooks.on("dnd5e.preUseItem", (item) => {
    if (handleItemUse(item) === false) return false;
});

Hooks.on("dnd5e.preUseActivity", (activity) => {
    if (handleItemUse(activity.item) === false) return false;
});


// ==========================================
// КОНТЕКСТНОЕ МЕНЮ ИНВЕНТАРЯ (ПРАВЫЙ КЛИК)
// ==========================================
Hooks.on("dnd5e.getItemContextOptions", (item, options) => {
  const flags = item.flags?.["hunters-hotpot"] || {};
  
  // ИСПРАВЛЕНО: Убрана привязка к имени ".includes('набор свежевателя')"
  const isKit = flags.isKit; 
  const isBag = flags.isGiftBag && item.type === "container";
  const isMaterial = flags.craftType;
  const isWIP = flags.isWIP;
  const cookBase = flags.cookBase;

  // 1. Мешок подарков
  if (isBag) {
    options.push(
      { name: "Котелок", icon: '<i class="fas fa-fire" style="color: #f97316;"></i>', callback: () => window.HuntersHotpot.cook(item.actor) },
      { name: "Верстак", icon: '<i class="fas fa-hammer" style="color: #1089b9;"></i>', callback: () => window.HuntersHotpot.craftPrep(item.actor) }
    );
  }

  // 2. Набор свежевателя
  if (isKit) {
    options.push(
      { name: "Разделать цель", icon: '<i class="fas fa-hand-sparkles" style="color: #3b82f6;"></i>', callback: () => window.HuntersHotpot.harvest(item.actor) },
      { name: "Починить набор", icon: '<i class="fas fa-tools" style="color: #8b5cf6;"></i>', callback: () => window.HuntersHotpot.repairKit(item.actor) }
    );
  }

  // 3. Заготовки
  if (isWIP) {
    options.push({
      name: "Продолжить работу",
      icon: '<i class="fas fa-hammer" style="color: #1089b9;"></i>',
      callback: () => window.HuntersHotpot.craftWork(item.actor, item)
    });
  }

  // 4. Съедобный лут
  if (cookBase && cookBase !== "none" && cookBase !== "spice") {
    options.push({
      name: "Приготовить",
      icon: '<i class="fas fa-fire" style="color: #f59e0b;"></i>',
      callback: () => window.HuntersHotpot.cook(item.actor)
    });
  }

  // 5. Сырье -> Поиск чертежей
  if (isMaterial) {
    options.push({
      name: "Чертежи из материала",
      icon: '<i class="fas fa-search" style="color: #10b981;"></i>',
      callback: () => {
        const cType = flags.craftType;
        const sType = flags.sourceType || "any";

        const available = Object.entries(HOTPOT_CONFIG.crafting.recipes || {}).filter(([_, r]) => {
          return (r.reqTags.includes(cType) || cType === "any") && (r.reqType === "any" || r.reqType === sType);
        });

        if (available.length === 0) return ui.notifications.warn("Нет чертежей для этого материала!");

        let htmlRows = available.map(([id, r]) => {
          const rData = HOTPOT_CONFIG.crafting.rarity[r.rarity] || {};
          const costMult = game.settings.get("hunters-hotpot", "craftCostMultiplier") ?? 1;
          let cost = (rData.rawCost || 0) * costMult;
          if (r.category === "potion" || r.isConsumable) cost = Math.max(1, Math.floor(cost / 2));

          return `
            <button class="hh-recipe-btn" data-id="${id}" style="display:flex; justify-content:space-between; align-items:center; padding: 6px 10px; margin-bottom: 6px; border: 1px solid var(--color-border-light-tertiary); background: var(--color-bg-body); border-radius: 4px; cursor: pointer; transition: 0.2s;">
              <div style="text-align: left; line-height: 1.2;">
                <div style="font-weight: bold; color: var(--color-text-dark-primary); font-size: 13px;">${r.name}</div>
                <div style="font-size: 11px; color: ${rData.color || "var(--color-text-dark-secondary)"};">${rData.label}</div>
              </div>
              <div style="font-size: 12px; font-weight: bold; color: #d97706;">
                ${cost} зм.
              </div>
            </button>
          `;
        }).join("");

        const content = `
          <div style="padding: 10px 5px; font-family: sans-serif;">
            <p style="margin: 0 0 10px; text-align: center; color: var(--color-text-dark-secondary); font-size: 13px;">Чертежи, принимающие <b>${item.name}</b>:</p>
            <div style="max-height: 300px; overflow-y: auto; padding-right: 4px;">
              ${htmlRows}
            </div>
          </div>
        `;

        const d = new Dialog({
          title: `Чертежи: ${item.name}`,
          content: content,
          buttons: {}, 
          render: (html) => {
            html.find('.hh-recipe-btn').click(ev => {
              const recipeId = ev.currentTarget.dataset.id;
              d.close();
              window.HuntersHotpot.craftPrep(item.actor, {
                cType: cType, sType: sType, itemId: item.id, recipeId: recipeId
              });
            });
            html.find('.hh-recipe-btn').hover(
              function() { $(this).css("background", "rgba(16, 185, 129, 0.1)"); },
              function() { $(this).css("background", "var(--color-bg-body)"); }
            );
          }
        }, { width: 340 }).render(true);
      }
    });
  }
});