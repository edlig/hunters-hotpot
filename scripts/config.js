export const HOTPOT_CONFIG = {
    sizes: {
        tiny: { label: "Крошечный", s: 1, h: 1, baseMin: 5, charge: 0 },
        sm: { label: "Маленький", s: 2, h: 1, baseMin: 15, charge: 1 },
        med: { label: "Средний", s: 3, h: 2, baseMin: 30, charge: 2 },
        lg: { label: "Большой", s: 4, h: 3, baseMin: 60, charge: 8 },
        huge: { label: "Огромный", s: 5, h: 4, baseMin: 120, charge: 20 },
        grg: { label: "Гигантский", s: 6, h: 5, baseMin: 480, charge: 50 }
    },

    damageMapping: {
        aberration: "psychic", celestial: "radiant", undead: "necrotic",
        ooze: "acid", plant: "poison", fiend: "fire", fey: "force",
        giant: "bludgeoning", beast: "slashing", monstrosity: "thunder",
        construct: "lightning", dragon: "fire", elemental: "fire", humanoid: "piercing"
    },

    statMapping: {
        beast: "str", giant: "str", monstrosity: "str",
        dragon: "dex", elemental: "dex",
        undead: "con", ooze: "con",
        construct: "int", plant: "int",
        aberration: "wis",
        celestial: "cha", fiend: "cha", fey: "cha", humanoid: "cha"
    },

    essenceScaling: {
        "common": { dice: "1", label: "Без эссенции" },
        "uncommon": { dice: "1d4", label: "Слабая Эссенция" },
        "rare": { dice: "1d6", label: "Грубая Эссенция" },
        "veryRare": { dice: "1d8", label: "Мощная Эссенция" },
        "legendary": { dice: "1d10", label: "Мифическая Эссенция" },
        "artifact": { dice: "1d12", label: "Божественная Эссенция" }
    },
    cooking: {
        recipes: {
            tier1: {
                "meat_steak": {
                    name: "Сочный стейк",
                    reqBase: "meat",
                    img: "icons/consumables/food/steak-cooked-grilled-brown.webp",
                    desc: "Ваши атаки насыщаются уроном стихии монстра. Сила эффекта зависит от эссенции.",
                    effectKey: "bonusDamage",
                },
                "fluid_sausage": {
                    name: "Кровяная колбаса",
                    reqBase: "fluid",
                    img: "icons/consumables/food/sausage-bratwurst-mustard-red-yellow.webp",
                    desc: "Кровь чудовища расширяет ваши физические пределы. Увеличивает максимум ХП на значение эссенции.",
                    effectKey: "maxHp",
                },
                "bone_broth": {
                    name: "Костный бульон",
                    reqBase: "bone",
                    img: "icons/consumables/food/bowl-stew-brown.webp",
                    desc: "Костяк зверя закаляет ваше тело. Вы получаете плоское снижение входящего урона от стихии монстра.",
                    effectKey: "drElement",
                },
                "organ_pie": {
                    name: "Ливерный пирог",
                    reqBase: "organ",
                    img: "icons/consumables/food/plate-pasta-noodles-white-red.webp",
                    desc: "Первобытные инстинкты обостряют ваши навыки. Вы добавляете кость эссенции к проверкам навыков характерискики монстра.",
                    effectKey: "bonusChecks",
                },
                "mystic_soup": {
                    name: "Мерцающая похлебка",
                    reqBase: "mystic",
                    img: "icons/commodities/materials/bowl-liquid-white.webp",
                    desc: "Чужеродная магия защищает ваш разум и тело. Вы добавляете кость эссенции к спасброскам характерискики монстра.",
                    effectKey: "bonusSaves",
                }
            }
        },
        quirks: {
            positive: [
                { name: "Железный желудок", desc: "Устойчивость урону ядом и преимущество в спасах от отравления.", eff: [{ key: "system.traits.dr.value", mode: 0, value: "poison" }, { key: "flags.midi-qol.advantage.ability.save.con", mode: 0, value: "1" }] },
                { name: "Сладкое Дыхание", desc: "+1 к проверкам Харизмы против существ, чувствующих запах.", eff: [] },
                { name: "Обучение Лингвиста", desc: "Вы понимаете язык съеденного существа.", eff: [] },
                { name: "Медленный расход энергии", desc: "+1 к спасброскам на поддержание концентрации.", eff: [{ key: "system.bonuses.abilities.save", mode: 2, value: "1" }] },
                { name: "Фантастическое бесстрашие", desc: "Вы невосприимчивы к состоянию испуга.", eff: [{ key: "system.traits.ci.value", mode: 0, value: "frightened" }] },
                { name: "Крепкая хватка", desc: "Преимущество на проверки Силы. Вы считаетесь на 1 размер больше.", eff: [{ key: "flags.midi-qol.advantage.ability.check.str", mode: 0, value: "1" }, { key: "flags.dnd5e.powerfulBuild", mode: 0, value: "1" }] },
                { name: "Спокойное пищеварение", desc: "Больше исцеления при трате костей хитов на отдыхе.", eff: [] },
                { name: "Фаст Фуд", desc: "Ваша скорость увеличивается на 5 футов.", eff: [{ key: "system.attributes.movement.walk", mode: 2, value: "+5" }] }
            ],
            negative: [
                { name: "Месть Ротворта", desc: "Вы отравлены и не можете отдыхать.", eff: [] },
                { name: "Тошнотворный Кошмар", desc: "-1 к проверкам Инт, Муд, Хар и Инициативе.", eff: [{ key: "system.attributes.init.bonus", mode: 2, value: "-1" }] },
                { name: "Косноязычие", desc: "Вы можете говорить только на языке съеденного существа.", eff: [] },
                { name: "Напыщенность", desc: "Зловонные газы. -1 к проверкам Скрытности и Харизмы.", eff: [{ key: "system.skills.ste.bonuses.check", mode: 2, value: "-1" }] },
                { name: "Бомба Борборугмуса", desc: "-1 к концентрации.", eff: [] },
                { name: "Высокогликемический", desc: "-1 к проверкам и спасам Ловкости.", eff: [] },
                { name: "Аллергическая реакция", desc: "Сыпь. Спасбросок Тел. СЛ 10 каждый ход.", eff: [] },
                { name: "Переедание", desc: "Чувство вздутия. Скорость снижена на 5 футов.", eff: [{ key: "system.attributes.movement.walk", mode: 2, value: "-5" }] }
            ]
        },
    },


    crafting: {
        rarity: {
            "common": { label: "Обычный", rawCost: 50, hours: 8, dc: 10, tier: 0, color: "#94a3b8" },
            "uncommon": { label: "Необычный", rawCost: 200, hours: 20, dc: 14, tier: 1, color: "#10b981" },
            "rare": { label: "Редкий", rawCost: 2000, hours: 100, dc: 18, tier: 2, color: "#3b82f6" },
            "veryRare": { label: "Очень редкий", rawCost: 20000, hours: 300, dc: 22, tier: 3, color: "#a855f7" },
            "legendary": { label: "Легендарный", rawCost: 50000, hours: 500, dc: 26, tier: 4, color: "#f59e0b" },
            "artifact": { label: "Артефакт", rawCost: 100000, hours: 1000, dc: 30, tier: 5, color: "#ef4444" }
        },
        categories: {
            "weapon": { label: "Оружие", img: "icons/skills/trades/smithing-tongs-metal-red.webp" },
            "armor": { label: "Броня / Щит", img: "icons/skills/trades/textiles-stitching-leather-brown.webp" },
            "potion": { label: "Зелье / Масло", img: "icons/skills/toxins/cauldron-pot-bubbles-green.webp" },
            "trinket": { label: "Магическая вещь", img: "icons/skills/social/orb-gold-claw-yellow.webp" }
        },
        quirks: {
            positive: [
                { name: "Иллюзорная гравировка", desc: "На предмете мерцает руна. Можно использовать фокус «Чудотворство» для создания искр или тихого звука вокруг предмета." },
                { name: "Всегда чистый", desc: "Материал отталкивает грязь и кровь. Предмет всегда выглядит так, будто его только что отполировали." },
                { name: "Комфортный", desc: "Предмет приятно холодит в жару и согревает в мороз." },
                { name: "Светоч", desc: "По желанию владельца предмет испускает тусклое свечение (цвета эссенции) в радиусе 5 футов." },
                { name: "Эхо создания", desc: "При извлечении оружия или надевании брони раздается тихий, приятный звук (звон, гул или шепот ветра)." }
            ],
            negative: [
                { name: "Разговорчивый", desc: "Иногда предмет издает тихие неуместные звуки (вздох, кряканье, странный скрип), когда вы его достаете." },
                { name: "Мерзкая текстура", desc: "Визуально предмет нормальный, но на ощупь кажется склизким, слишком теплым или покрытым микро-мурашками." },
                { name: "Пачкающий", desc: "Предмет оставляет слабые цветные следы (сажа, пыльца, блестки) на руках и одежде. Легко смывается, но раздражает." },
                { name: "Резкий запах", desc: "От предмета пахнет мокрой псиной, серой или тиной в радиусе 5 футов." },
                { name: "Обидчивый", desc: "Если вы выбрасываете «1» на кубике, предмет тускнеет и выглядит непрезентабельно до следующего отдыха." }
            ]
        }
    },


    kit: {
        maxChargesLimit: 100, // Абсолютный предел зарядов
        defaultMax: 10,       // Базовый максимум при создании
    },

    getCrMult: (cr) => {
        if (cr < 1) return cr;
        return cr * cr;
    },

    getSkill: (type) => {
        const t = (type || "").toLowerCase();
        if (["aberration", "elemental", "fey", "construct"].includes(t)) return "arc";
        if (["celestial", "fiend"].includes(t)) return "rel";
        if (["ooze", "plant"].includes(t)) return "nat";
        if (["giant", "humanoid", "undead"].includes(t)) return "med";
        return "sur";
    },

    getEssence: (cr) => {
        if (cr < 3) return null;
        if (cr <= 6) return { id: "uncommon", dc: 25, p: 100, name: "Слабая Эссенция", img: "icons/magic/light/explosion-star-small-teal.webp" };
        if (cr <= 11) return { id: "rare", dc: 30, p: 1200, name: "Грубая Эссенция", img: "icons/magic/light/explosion-star-blue.webp" };
        if (cr <= 17) return { id: "veryRare", dc: 35, p: 15000, name: "Мощная Эссенция", img: "icons/magic/light/explosion-star-pink.webp" };
        if (cr <= 24) return { id: "legendary", dc: 40, p: 40000, name: "Мифическая Эссенция", img: "icons/magic/light/explosion-star-large-orange.webp" };
        return { id: "artifact", dc: 50, p: 80000, name: "Божественная Эссенция", img: "icons/magic/light/explosion-star-glow-blue-purple.webp" };
    },

    craftTags: {
        "soft_cover": { label: "Мягкие покровы", icon: "🧥", desc: "Легкая броня, плащи, сумки" },
        "hard_cover": { label: "Твердые покровы", icon: "🛡️", desc: "Средняя/тяжелая броня, щиты" },
        "nat_weapon": { label: "Естественное оружие", icon: "🗡️", desc: "Оружие, боеприпасы" },
        "alchemy": { label: "Алхимия", icon: "🧪", desc: "Зелья, масла, взрывчатка" },
        "mystic": { label: "Мистика", icon: "🔮", desc: "Чудесные предметы, фокусы" },
        "any": { label: "Универсальное", icon: "🌟", desc: "Подходит для любых чертежей" }
    },

    harvestCategories: {
        // ТИР 1 (СЛ 10)
        "meat": {
            label: "Мякоть / Филе", img: "icons/consumables/meat/steak-raw-red-pink.webp", dc: 10, w: 15, p: 0.5, u: false, cType: "alchemy", cookBase: "meat",
            presets: ["Мясо", "Филе", "Съедобные волокна", "Студенистая масса"], t: ["aberration", "beast", "giant", "humanoid", "dragon", "monstrosity", "plant", "fiend", "fey", "ooze"]
        },
        "soft_cover": {
            label: "Мягкие покровы", img: "icons/commodities/leather/leather-scrap-brown.webp", dc: 10, w: 10, p: 2.0, u: false, cType: "soft_cover", cookBase: "none",
            presets: ["Шкура", "Кожа", "Перья", "Мембрана", "Шерсть", "Паутина", "Лианы"], t: ["aberration", "beast", "dragon", "monstrosity", "giant", "fiend", "fey", "celestial"]
        },
        "bone": { label: "Костяк", img: "icons/commodities/bones/bones-stack-worn-brown.webp", dc: 10, w: 15, p: 0.5, u: false, cType: "hard_cover", cookBase: "bone", presets: ["Кости", "Хрящи", "Череп", "Каркас"], t: ["aberration", "beast", "dragon", "monstrosity", "giant", "fiend", "fey", "undead", "humanoid", "construct", "elemental"] },
        // ТИР 2 (СЛ 15)
        "hard_cover": {
            label: "Твердые покровы", img: "icons/commodities/leather/scales-brown.webp", dc: 15, w: 12, p: 2.5, u: false, cType: "hard_cover", cookBase: "none",
            presets: ["Чешуя", "Панцирь", "Хитин", "Кора", "Каменная порода", "Металл"], t: ["aberration", "beast", "dragon", "monstrosity", "construct", "plant", "fiend", "elemental"]
        },
        "weapon": {
            label: "Естественное оружие", img: "icons/creatures/claws/claw-hooked-curved.webp", dc: 15, w: 3, p: 3.0, u: false, cType: "nat_weapon", cookBase: "none",
            presets: ["Когти", "Клыки", "Рога", "Бивни", "Шипы", "Жвала"], t: ["aberration", "beast", "dragon", "monstrosity", "giant", "fiend", "fey", "undead", "construct", "plant", "celestial"]
        },
        "appendage": {
            label: "Особые конечности", img: "icons/creatures/tentacles/tentacles-octopus-black-pink.webp", dc: 15, w: 5, p: 2.0, u: true, cType: "soft_cover", cookBase: "meat",
            presets: ["Хвост", "Щупальце", "Крыло", "Плавник", "Ложноножка"], t: ["aberration", "beast", "dragon", "monstrosity", "fiend", "fey", "celestial"]
        },
        "fluid": {
            label: "Биожидкости", img: "icons/consumables/potions/round-decorated-snake-green.webp", dc: 15, w: 1, p: 1.5, u: false, cType: "alchemy", cookBase: "fluid",
            presets: ["Кровь", "Ихор", "Слизь", "Кислота", "Древесный сок", "Машинное масло", "Жидкое пламя"], t: ["aberration", "beast", "dragon", "monstrosity", "giant", "fiend", "fey", "plant", "ooze", "construct", "elemental", "celestial", "humanoid"]
        },
        // ТИР 3 (СЛ 20)
        "organ": {
            label: "Внутренние органы", img: "icons/commodities/biological/organ-brain-red.webp", dc: 20, w: 2, p: 4.0, u: true, cType: "alchemy", cookBase: "organ",
            presets: ["Сердце", "Печень", "Желудок", "Жабры", "Легкие"], t: ["aberration", "beast", "dragon", "monstrosity", "giant", "fiend", "fey", "celestial", "humanoid"]
        },
        "gland": {
            label: "Железы и Токсины", img: "icons/commodities/biological/pustules-brown.webp", dc: 20, w: 1, p: 10.0, u: true, cType: "alchemy", cookBase: "spice",
            presets: ["Ядовитая железа", "Кислотный мешок", "Споровик", "Газовый пузырь"], t: ["aberration", "beast", "dragon", "monstrosity", "plant", "ooze", "fiend"]
        },
        "dust": {
            label: "Эфирный осадок", img: "icons/commodities/materials/powder-teal.webp", dc: 20, w: 0.5, p: 8.0, u: false, cType: "alchemy", cookBase: "spice",
            presets: ["Эктоплазма", "Пепел", "Волшебная пыльца", "Теневая материя"], t: ["fey", "fiend", "celestial", "elemental", "undead", "ooze"]
        },
        // ТИР 4 (СЛ 25)
        "focus": {
            label: "Мистический фокус", img: "icons/commodities/materials/glass-orb-green.webp", dc: 25, w: 2, p: 15.0, u: true, cType: "mystic", cookBase: "mystic",
            presets: ["Мозг", "Глаз", "Магическое ядро", "Элементальная искра"], t: ["aberration", "dragon", "monstrosity", "fiend", "celestial", "elemental", "construct", "fey", "ooze"]
        },
        "unique": {
            label: "🌟 Уникальный трофей", img: "icons/commodities/gems/pearl-fire-swirl.webp", dc: 25, w: 2, p: 25.0, u: true, cType: "any", cookBase: "any",
            presets: [], t: ["aberration", "beast", "celestial", "construct", "dragon", "elemental", "fey", "fiend", "giant", "humanoid", "monstrosity", "ooze", "plant", "undead"]
        }
    }
};