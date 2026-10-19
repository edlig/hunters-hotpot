export function registerSettings() {
  const mod = "hunters-hotpot";

  // === ГОТОВКА ===
  game.settings.register(mod, "cookPortionWeight", {
    name: "Вес сырья на 1 порцию",
    hint: "Сколько фунтов (lb) мяса или шкур требуется для приготовления 1 порции еды. По умолчанию: 2.",
    scope: "world", config: true, type: Number, default: 2
  });

  // === ИНСТРУМЕНТЫ (Починка) ===
  game.settings.register(mod, "kitRepairCost", {
    name: "Стоимость ремонта набора",
    hint: "Сколько фунтов (lb) сырья сгорает для восстановления 1 заряда Набора Свежевателя. По умолчанию: 1.",
    scope: "world", config: true, type: Number, default: 1
  });

  // === КРАФТ ===
  game.settings.register(mod, "craftTimeMultiplier", {
    name: "Множитель времени крафта",
    hint: "Глобальный модификатор времени (в часах) для создания предметов. 1 = стандартно, 0.5 = в два раза быстрее, 2 = в два раза дольше.",
    scope: "world", config: true, type: Number, default: 1
  });

  game.settings.register(mod, "craftCostMultiplier", {
    name: "Множитель стоимости крафта",
    hint: "Влияет на то, на какую сумму в золотых (зм) нужно закинуть трофеев для начала проекта.",
    scope: "world", config: true, type: Number, default: 1
  });

  // === СБОР ТРОФЕЕВ ===
  game.settings.register(mod, "harvestYieldMultiplier", {
    name: "Множитель добычи (Количество)",
    hint: "Сколько кусков мяса/шкур выпадает за 1 слот туши. Множитель применяется к базовой формуле размера существа.",
    scope: "world", config: true, type: Number, default: 1
  });
}