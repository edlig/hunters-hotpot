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
  try {
    // Асинхронно скачиваем базу рецептов
    const response = await fetch("modules/hunters-hotpot/data/recipes.json");
    const recipesData = await response.json();

    // Подмешиваем скачанные рецепты в конфиг
    HOTPOT_CONFIG.crafting.recipes = recipesData;

    console.log("Hunters Hotpot | База рецептов успешно загружена:", Object.keys(recipesData).length, "шт.");
  } catch (error) {
    console.error("Hunters Hotpot | Ошибка загрузки базы рецептов!", error);
  }
});

// Привязываем API к window, чтобы макросы работали напрямую через HuntersHotpot.cook()
window.HuntersHotpot = HuntersHotpotAPI;

Hooks.once("init", () => {
  console.log("Hunter's Hotpot | Инициализация модуля...");

  // Регистрируем API в системе модулей Foundry
  const module = game.modules.get("hunters-hotpot");
  if (module) {
    module.api = HuntersHotpotAPI;
  }
  registerSettings();
});

// ==========================================
// КОНТЕКСТНОЕ МЕНЮ ИНВЕНТАРЯ (ПРАВЫЙ КЛИК)
// ==========================================
Hooks.on("dnd5e.getItemContextOptions", (item, options) => {
  const isKit = item.flags?.["hunters-hotpot"]?.isKit || item.name.toLowerCase().includes("набор свежевателя");
  const isBag = item.name.includes("Мешок подарков") && item.type === "container";
  const isMaterial = item.flags?.["hunters-hotpot"] && item.flags["hunters-hotpot"].craftType;

  // 1. Мешок подарков -> Готовка и Верстак
  if (isBag) {
    options.push(
      {
        name: "Котелок",
        icon: '<i class="fas fa-fire" style="color: #f97316;"></i>',
        callback: () => window.HuntersHotpot.cook(item.actor)
      },
      {
        name: "Верстак",
        icon: '<i class="fas fa-hammer" style="color: #1089b9;"></i>',
        callback: () => window.HuntersHotpot.craftPrep(item.actor)
      }
    );
  }

  // 2. Набор свежевателя -> Разделка и Починка
  if (isKit) {
    options.push(
      {
        name: "Разделать цель",
        icon: '<i class="fas fa-hand-sparkles" style="color: #3b82f6;"></i>',
        callback: () => window.HuntersHotpot.harvest(item.actor)
      },
      {
        name: "Починить набор",
        icon: '<i class="fas fa-tools" style="color: #8b5cf6;"></i>',
        callback: () => window.HuntersHotpot.repairKit(item.actor)
      }
    );
  }

  // 3. Контекстное меню для Заготовок (Уже есть)
  if (item.getFlag("hunters-hotpot", "isWIP")) {
    options.push({
      name: "Продолжить работу",
      icon: '<i class="fas fa-hammer" style="color: #1089b9;"></i>',
      callback: () => CraftWorkApp.init(item.actor, item)
    });
  }

  // 4. НОВОЕ: Контекстное меню для съедобного лута
  const cookBase = item.getFlag("hunters-hotpot", "cookBase");
  if (cookBase && cookBase !== "none" && cookBase !== "spice") {
    options.push({
      name: "Приготовить",
      icon: '<i class="fas fa-fire" style="color: #f59e0b;"></i>',
      callback: () => new CookApp(item.actor).render(true)
    });
  }


  // 5. Сырье -> Поиск чертежей (ваш старый код)
  if (isMaterial) {
    options.push({
      name: "Чертежи из материала",
      icon: '<i class="fas fa-search" style="color: #10b981;"></i>',
      callback: () => {
        const cType = item.flags["hunters-hotpot"].craftType;
        const sType = item.flags["hunters-hotpot"].sourceType || "any";

        const available = Object.entries(HOTPOT_CONFIG.crafting.recipes || {}).filter(([_, r]) => {
          return (r.reqTags.includes(cType) || cType === "any") && (r.reqType === "any" || r.reqType === sType);
        });

        if (available.length === 0) return ui.notifications.warn("Нет чертежей для этого материала!");

        // Генерируем красивый HTML-список карточек
        let htmlRows = available.map(([id, r]) => {
          const rData = HOTPOT_CONFIG.crafting.rarity[r.rarity] || {};
          
          // Считаем цену с учетом настроек и скидки на зелья
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
          buttons: {}, // Оставляем пустым, чтобы не рендерить страшные дефолтные кнопки
          render: (html) => {
            // Вешаем обработчик клика на наши красивые карточки
            html.find('.hh-recipe-btn').click(ev => {
              const recipeId = ev.currentTarget.dataset.id;
              d.close();
              window.HuntersHotpot.craftPrep(item.actor, {
                cType: cType, sType: sType, itemId: item.id, recipeId: recipeId
              });
            });
            // Эффект наведения
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
