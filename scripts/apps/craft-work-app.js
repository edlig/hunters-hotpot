import { CraftService } from "../services/craft-service.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class CraftWorkApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "hotpot-craft-work", classes: ["hunters-hotpot"], tag: "form",
    window: { title: "Downtime: Работа над проектом", icon: "fas fa-tools" },
    position: { width: 340, height: "auto" },
    form: { handler: function(e, f, d) { this._onSubmit(e, f, d); }, closeOnSubmit: true }
  };

  static PARTS = { form: { template: "modules/hunters-hotpot/templates/craft-work.hbs" } };

  static async init(actor, wipItem = null) {
    if (!actor) return ui.notifications.warn("Не выбран персонаж!");
    const targetItem = wipItem || actor.items.find(i => i.getFlag("hunters-hotpot", "isWIP"));
    
    if (!targetItem) return ui.notifications.warn("У вас нет незаконченных проектов (заготовок)!");
    new CraftWorkApp(actor, targetItem).render(true);
  }

  constructor(actor, wipItem, options = {}) {
    super(options); 
    this.actor = actor; 
    this.wipItem = wipItem;
  }

  async _prepareContext() {
    const flags = this.wipItem.flags["hunters-hotpot"] || {};
    const current = flags.currentHours || 0;
    const target = flags.targetHours || 1;
    const dc = flags.dc || 10;
    const category = flags.category || "trinket";
    
    const conMod = this.actor.system.abilities?.con?.mod || 0;
    const maxHours = Math.max(4, 8 + conMod); 
    const pb = this.actor.system.attributes?.prof || 2;

    // 1. Инструменты
    const tools = this.actor.items.filter(i => i.type === "tool");
    let selectedTool = null;

    if (flags.toolId) selectedTool = tools.find(t => t.id === flags.toolId);
    
    if (!selectedTool && tools.length > 0) {
      const map = {
        weapon: ["smith", "кузнец"],
        armor: ["leatherworker", "smith", "кожевн", "кузнец"],
        potion: ["alchemist", "herbalism", "poisoner", "алхим", "травн", "яд", "cook", "повар"],
        trinket: ["tinker", "jeweler", "woodcarver", "carpenter", "жестян", "ювелир", "резч", "плотник"]
      };
      const keywords = map[category] || [];
      selectedTool = tools.find(t => {
        const base = t.system.type?.baseItem || "";
        const name = t.name.toLowerCase();
        return keywords.some(k => base.includes(k) || name.includes(k));
      });
      if (!selectedTool) selectedTool = tools[0];
    }

    const toolOptions = tools.map(t => ({ id: t.id, name: t.name, selected: selectedTool && selectedTool.id === t.id }));

    // 2. Владение (Тройная проверка для всех версий Foundry)
    let isProficient = flags.hasProf !== undefined ? flags.hasProf : false;
    
    if (flags.hasProf === undefined && selectedTool) {
      const base = selectedTool.system.type?.baseItem;
      // Проверяем: 1. Новое API предмета, 2. Старое API предмета, 3. Знания самого персонажа
      isProficient = (selectedTool.system.prof?.multiplier >= 1) || 
                     (selectedTool.system.proficient >= 1) || 
                     (base && this.actor.system.tools?.[base]?.value >= 1);
    }

    // 3. Характеристики
    const defaultStat = { weapon: "str", armor: "str", potion: "int", trinket: "dex" }[category] || "int";
    const savedStat = flags.stat || defaultStat;

    const abilities = { str: "Сила", dex: "Ловкость", con: "Телосложение", int: "Интеллект", wis: "Мудрость", cha: "Харизма" };
    const statOptions = Object.entries(abilities).map(([k, v]) => {
      const mod = this.actor.system.abilities[k]?.mod || 0;
      return { id: k, label: `${v} (${mod >= 0 ? '+' : ''}${mod})`, selected: k === savedStat };
    });

    const lastHours = flags.lastHours || 1;

    return { 
      itemName: this.wipItem.name, 
      current, target, maxHours, dc, pb,
      tools: toolOptions, hasTools: tools.length > 0,
      isProficient, statOptions, lastHours
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const el = this.element;

    el.addEventListener("change", (e) => {
      if (e.target.matches("#tool-sel")) {
        const toolId = e.target.value;
        const tool = this.actor.items.get(toolId);
        if (tool) {
          const base = tool.system.type?.baseItem;
          const isProf = (tool.system.prof?.multiplier >= 1) || (tool.system.proficient >= 1) || (base && this.actor.system.tools?.[base]?.value >= 1);
          el.querySelector("#prof-cb").checked = isProf;
        }
      }
    });
  }

  async _onSubmit(event, form, formData) {
    const hoursInput = parseInt(formData.object.hours);
    const hours = isNaN(hoursInput) ? 1 : hoursInput;
    
    const hasHelper = formData.object.hasHelper === true || formData.object.hasHelper === "on" || formData.object.hasHelper === "true";
    const hasProf = formData.object.hasProf === true || formData.object.hasProf === "on" || formData.object.hasProf === "true";
    
    const toolId = formData.object.toolId;
    const statId = formData.object.statId;

    // СОХРАНЯЕМ ПАРАМЕТРЫ СЕССИИ В ЗАГОТОВКУ!
    await this.actor.updateEmbeddedDocuments("Item", [{
      _id: this.wipItem.id,
      "flags.hunters-hotpot.toolId": toolId,
      "flags.hunters-hotpot.hasProf": hasProf,
      "flags.hunters-hotpot.stat": statId,
      "flags.hunters-hotpot.lastHours": hours
    }]);
    
    const roll = await new Roll("1d20").evaluate();
    await CraftService.processWorkSession(this.actor, this.wipItem, hours, hasHelper, hasProf, statId, roll);
  }
}