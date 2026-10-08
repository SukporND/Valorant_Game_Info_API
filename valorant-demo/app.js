const API_BASE = 'https://valorant-api.com/v1';
const categories = [
  ['agent', '◈', 'Agents'],
  ['role', '◎', 'Roles'],
  ['weapon', '⌁', 'Weapons'],
  ['skin', '◇', 'Weapon Skins'],
  ['map', '▦', 'Maps']
];
const pickerConfigs = {
  agent: { dataKey: 'agent', label: 'Agents', itemType: 'agent' },
  primaryWeapon: { dataKey: 'weapon', label: 'Primary Weapons', itemType: 'weapon', filter: isPrimaryWeapon },
  primarySkin: { dataKey: 'skin', label: 'Primary Weapon Skins', itemType: 'skin', weaponKey: 'primaryWeapon', weaponFilter: isPrimaryWeapon },
  secondaryWeapon: { dataKey: 'weapon', label: 'Secondary Weapons', itemType: 'weapon', filter: isSecondaryWeapon },
  secondarySkin: { dataKey: 'skin', label: 'Secondary Weapon Skins', itemType: 'skin', weaponKey: 'secondaryWeapon', weaponFilter: isSecondaryWeapon },
  meleeWeapon: { dataKey: 'weapon', label: 'Melee Weapons', itemType: 'weapon', filter: isMeleeWeapon },
  meleeSkin: { dataKey: 'skin', label: 'Melee Skins', itemType: 'skin', weaponKey: 'meleeWeapon', weaponFilter: isMeleeWeapon },
  map: { dataKey: 'map', label: 'Maps', itemType: 'map' }
};
const cards = document.getElementById('cards');
const dataStatus = document.getElementById('dataStatus');
const detailDialog = document.getElementById('detailDialog');
const pickerDialog = document.getElementById('pickerDialog');
const resourceData = { agent: [], role: [], weapon: [], skin: [], map: [] };
const builderSelection = {};
const skinPriceByTier = {
  select: [875, 875],
  deluxe: [1275, 1275],
  premium: [1775, 1775],
  exclusive: [2175, 2675],
  ultra: [2475, 2475]
};
let activeFilter = 'all';
let searchTerm = '';
let pickerCategory = 'agent';
let pickerSearchTerm = '';

async function fetchResource(resource) {
  const response = await fetch(`${API_BASE}/${resource}?language=en-US`);
  if (!response.ok) {
    throw new Error(`Could not load ${resource}: HTTP ${response.status}`);
  }
  const result = await response.json();
  if (result.status !== 200 || !Array.isArray(result.data)) {
    throw new Error(`The ${resource} response did not contain a data list.`);
  }
  return result.data;
}

function normalizeData(agents, weapons, maps, contentTiers) {
  resourceData.agent = agents.filter(agent => agent.isPlayableCharacter && agent.role);

  const rolesById = new Map();
  for (const agent of resourceData.agent) {
    rolesById.set(agent.role.uuid, agent.role);
  }
  resourceData.role = [...rolesById.values()];
  resourceData.weapon = weapons;
  const contentTierById = new Map(contentTiers.map(tier => [tier.uuid, tier]));
  resourceData.skin = [...new Map(
    weapons.flatMap(weapon => (weapon.skins || []).map(skin => [
      skin.uuid,
      {
        ...skin,
        weaponName: weapon.displayName,
        weaponCategory: weapon.category,
        contentTier: contentTierById.get(skin.contentTierUuid) || null,
        displayIcon: skin.chromas?.find(chroma => chroma.fullRender)?.fullRender || skin.displayIcon ||
          skin.levels?.find(level => level.displayIcon)?.displayIcon ||
          skin.chromas?.find(chroma => chroma.displayIcon || chroma.fullRender)?.displayIcon ||
          skin.chromas?.find(chroma => chroma.fullRender)?.fullRender || ''
      }
    ]))
  ).values()];
  resourceData.map = maps;
}

function isPrimaryWeapon(weapon) {
  return weapon.category !== 'EEquippableCategory::Sidearm' &&
    weapon.category !== 'EEquippableCategory::Melee';
}

function isSecondaryWeapon(weapon) {
  return weapon.category === 'EEquippableCategory::Sidearm';
}

function isMeleeWeapon(weapon) {
  return weapon.category === 'EEquippableCategory::Melee';
}

function getSkinPrice(skin) {
  const tierName = skin.contentTier?.devName?.toLocaleLowerCase();
  const tierPrice = tierName ? skinPriceByTier[tierName] : null;
  if (!tierPrice) return null;
  const multiplier = skin.weaponCategory === 'EEquippableCategory::Melee' ? 2 : 1;
  return { min: tierPrice[0] * multiplier, max: tierPrice[1] * multiplier };
}

function formatVp(value) {
  return `${value.toLocaleString()} VP`;
}

function getSkinPriceLabel(skin) {
  const price = getSkinPrice(skin);
  if (!price) return 'Price unavailable';
  return price.min === price.max
    ? `Estimated ${formatVp(price.min)}`
    : `Estimated ${formatVp(price.min)}–${formatVp(price.max)}`;
}

function createCard(category, item) {
  const card = document.createElement('article');
  card.className = 'card';
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.addEventListener('click', () => showDetails(category, item));
  card.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      showDetails(category, item);
    }
  });

  const icon = document.createElement('div');
  icon.className = 'icon';
  if (item.displayIcon || item.listViewIcon) {
    const image = document.createElement('img');
    image.src = item.displayIcon || item.listViewIcon;
    image.alt = '';
    image.loading = 'lazy';
    icon.append(image);
  } else {
    icon.textContent = categories.find(([key]) => key === category)[1];
  }

  const title = document.createElement('h3');
  title.textContent = item.displayName;
  const description = document.createElement('p');
  description.textContent = getSummary(category, item);
  card.append(icon, title, description);
  return card;
}

function getSummary(category, item) {
  if (category === 'agent') {
    const abilities = (item.abilities || []).map(ability => ability.displayName).filter(Boolean);
    return `${item.role.displayName}${abilities.length ? ` · ${abilities.join(', ')}` : ''}`;
  }
  if (category === 'role') return item.description || 'Agent role';
  if (category === 'weapon') {
    const group = item.shopData?.categoryText || item.category?.split('::').pop() || 'Weapon';
    const price = item.shopData?.cost;
    return Number.isFinite(price) ? `${group} · ${price.toLocaleString()} credits` : group;
  }
  if (category === 'skin') return `${item.weaponName} skin · ${getSkinPriceLabel(item)}`;
  return item.tacticalDescription || item.coordinates || 'Valorant map';
}

function matchesSearch(category, item) {
  if (!searchTerm) return true;
  const abilities = category === 'agent'
    ? (item.abilities || []).flatMap(ability => [ability.displayName, ability.description])
    : [];
  const searchableText = [
    item.displayName,
    item.description,
    item.tacticalDescription,
    item.coordinates,
    item.weaponName,
    getSummary(category, item),
    ...abilities
  ].filter(Boolean).join(' ').toLocaleLowerCase();
  return searchableText.includes(searchTerm);
}

function renderSkinGroups(skins, parent) {
  const groups = new Map();
  for (const skin of skins) {
    if (!groups.has(skin.weaponName)) groups.set(skin.weaponName, []);
    groups.get(skin.weaponName).push(skin);
  }

  for (const [index, [weaponName, weaponSkins]] of [...groups.entries()].entries()) {
    const group = document.createElement('details');
    group.className = 'skin-group';
    group.open = activeFilter === 'all' || Boolean(searchTerm) || index === 0;
    const heading = document.createElement('summary');
    heading.textContent = `${weaponName} · ${weaponSkins.length} skins`;
    group.append(heading);
    const renderGroupSkins = () => {
      if (group.dataset.rendered) return;
      const grid = document.createElement('div');
      grid.className = 'grid';
      for (const skin of weaponSkins) grid.append(createCard('skin', skin));
      group.append(grid);
      group.dataset.rendered = 'true';
    };
    group.addEventListener('toggle', () => {
      if (group.open) renderGroupSkins();
    });
    if (group.open) renderGroupSkins();
    parent.append(group);
  }
}

function renderCards() {
  cards.replaceChildren();
  const selectedCategories = categories.filter(([category]) => activeFilter === 'all' || category === activeFilter);
  let resultCount = 0;
  let displayedCount = 0;
  for (const [category, , categoryName] of selectedCategories) {
    const matchingItems = resourceData[category].filter(item => matchesSearch(category, item));
    resultCount += matchingItems.length;
    let items = matchingItems;
    if (category === 'skin' && activeFilter === 'all' && !searchTerm) {
      items = resourceData.weapon.flatMap(weapon =>
        matchingItems.filter(skin => skin.weaponName === weapon.displayName).slice(0, 4)
      );
    }
    displayedCount += items.length;
    if (!items.length) continue;
    const group = document.createElement('div');
    group.className = 'data-group';
    if (activeFilter === 'all') {
      const heading = document.createElement('h2');
      heading.textContent = categoryName;
      group.append(heading);
    }
    if (category === 'skin') {
      renderSkinGroups(items, group);
    } else {
      const grid = document.createElement('div');
      grid.className = 'grid';
      for (const item of items) grid.append(createCard(category, item));
      group.append(grid);
    }
    cards.append(group);
  }
  if (displayedCount === 0) {
    const emptyMessage = document.createElement('p');
    emptyMessage.className = 'empty-results';
    emptyMessage.textContent = 'No game data matches your search.';
    cards.append(emptyMessage);
  }
  dataStatus.textContent = searchTerm
    ? `${resultCount.toLocaleString()} matching ${resultCount === 1 ? 'result' : 'results'}.`
    : activeFilter === 'all' && displayedCount < resultCount
      ? `Showing ${displayedCount.toLocaleString()} of ${resultCount.toLocaleString()} items; select Weapon Skins to browse all skins.`
      : `Showing ${resultCount.toLocaleString()} ${resultCount === 1 ? 'item' : 'items'}.`;
}

function showDetails(category, item) {
  const title = detailDialog.querySelector('#detailTitle');
  const description = detailDialog.querySelector('#detailDescription');
  const image = detailDialog.querySelector('#detailImage');
  const facts = detailDialog.querySelector('#detailFacts');
  const abilities = detailDialog.querySelector('#detailAbilities');
  title.textContent = item.displayName;
  description.textContent = item.description || item.tacticalDescription || getSummary(category, item);
  image.hidden = !(item.displayIcon || item.listViewIcon);
  image.src = item.displayIcon || item.listViewIcon || '';
  image.alt = item.displayName;
  facts.replaceChildren();
  abilities.replaceChildren();
  abilities.hidden = category !== 'agent';

  const entries = category === 'agent'
    ? [['Role', item.role.displayName]]
    : category === 'weapon'
      ? [
          ['Category', item.shopData?.categoryText || item.category?.split('::').pop()],
          ['Price', Number.isFinite(item.shopData?.cost) ? `${item.shopData.cost.toLocaleString()} credits` : 'Not provided by API'],
          ['Fire rate', Number.isFinite(item.weaponStats?.fireRate) ? `${item.weaponStats.fireRate} rounds/second` : 'Not provided by API'],
          ['Skins', (item.skins || []).length]
        ]
      : category === 'skin'
        ? [
            ['Weapon', item.weaponName],
            ['Edition', item.contentTier?.displayName || 'Not provided by API'],
            ['Estimated price', getSkinPriceLabel(item)]
          ]
        : category === 'map'
          ? [['Coordinates', item.coordinates]]
          : [['Agents', resourceData.agent.filter(agent => agent.role.uuid === item.uuid).map(agent => agent.displayName).join(', ')]];
  for (const [label, value] of entries) {
    if (!value) continue;
    const row = document.createElement('p');
    const name = document.createElement('strong');
    name.textContent = `${label}: `;
    row.append(name, document.createTextNode(String(value)));
    facts.append(row);
  }

  if (category === 'agent') {
    const heading = document.createElement('h3');
    heading.textContent = 'Abilities';
    abilities.append(heading);
    for (const ability of (item.abilities || []).filter(entry => entry.displayName)) {
      const card = document.createElement('article');
      card.className = 'ability-card';
      if (ability.displayIcon) {
        const abilityIcon = document.createElement('img');
        abilityIcon.src = ability.displayIcon;
        abilityIcon.alt = '';
        abilityIcon.loading = 'lazy';
        card.append(abilityIcon);
      }
      const content = document.createElement('div');
      const abilityTitle = document.createElement('h4');
      abilityTitle.textContent = `${ability.displayName} · ${ability.slot}`;
      const abilityDescription = document.createElement('p');
      abilityDescription.textContent = ability.description || 'No description available.';
      const abilityCost = ability.cost ?? ability.price ?? ability.shopData?.cost;
      const price = document.createElement('p');
      price.className = 'ability-cost';
      price.textContent = Number.isFinite(abilityCost)
        ? `Price: ${abilityCost.toLocaleString()} credits`
        : 'Price: Not provided by API';
      content.append(abilityTitle, abilityDescription, price);
      card.append(content);
      abilities.append(card);
    }
  }

  if (category === 'weapon' && Array.isArray(item.weaponStats?.damageRanges)) {
    const damageHeading = document.createElement('h3');
    damageHeading.textContent = 'Damage by range';
    facts.append(damageHeading);
    for (const range of item.weaponStats.damageRanges) {
      const row = document.createElement('p');
      row.className = 'damage-range';
      row.textContent = `${range.rangeStartMeters}–${range.rangeEndMeters} m · Head ${range.headDamage} · Body ${range.bodyDamage} · Leg ${range.legDamage}`;
      facts.append(row);
    }
  }
  detailDialog.showModal();
}

function getItemImage(category, item) {
  if (category === 'map') return item.listViewIcon || item.displayIcon || '';
  return item.displayIcon || item.listViewIcon || '';
}

function updatePickerButton(category) {
  const button = document.querySelector(`[data-picker-category="${category}"]`);
  const value = button.querySelector('[data-picker-value]');
  const icon = button.querySelector('.picker-icon');
  const item = builderSelection[category];
  const config = pickerConfigs[category];
  value.textContent = item?.displayName || `Select ${config.label.replace(/s$/, '')}`;
  const imageUrl = item && getItemImage(config.itemType, item);
  icon.replaceChildren();
  if (imageUrl) {
    const image = document.createElement('img');
    image.src = imageUrl;
    image.alt = '';
    image.loading = 'lazy';
    icon.append(image);
  } else {
    icon.textContent = categories.find(([key]) => key === config.itemType)[1];
  }
}

function createPickerItem(category, item) {
  const config = pickerConfigs[category];
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'card picker-item';
  button.setAttribute('aria-pressed', String(builderSelection[category]?.uuid === item.uuid));
  if (builderSelection[category]?.uuid === item.uuid) button.classList.add('selected');
  button.addEventListener('click', () => selectBuilderItem(category, item));

  const icon = document.createElement('div');
  icon.className = 'icon';
  const imageUrl = getItemImage(config.itemType, item);
  if (imageUrl) {
    const image = document.createElement('img');
    image.src = imageUrl;
    image.alt = '';
    image.loading = 'lazy';
    icon.append(image);
  } else {
    icon.textContent = categories.find(([key]) => key === config.itemType)[1];
  }

  const title = document.createElement('h3');
  title.textContent = item.displayName;
  const summary = document.createElement('p');
  summary.textContent = config.itemType === 'skin'
    ? `${item.weaponName} · ${getSkinPriceLabel(item)}`
    : getSummary(config.itemType, item);
  button.append(icon, title, summary);
  return button;
}

function renderPickerSkinGroups(skins, container) {
  const groups = new Map();
  for (const skin of skins) {
    if (!groups.has(skin.weaponName)) groups.set(skin.weaponName, []);
    groups.get(skin.weaponName).push(skin);
  }

  for (const [weaponName, weaponSkins] of groups) {
    const group = document.createElement('details');
    group.className = 'skin-group picker-skin-group';
    const weaponKey = pickerConfigs[pickerCategory].weaponKey;
    group.open = Boolean(pickerSearchTerm) || builderSelection[weaponKey]?.displayName === weaponName;
    const heading = document.createElement('summary');
    heading.textContent = `${weaponName} · ${weaponSkins.length} skins`;
    group.append(heading);
    const renderItems = () => {
      if (group.dataset.rendered) return;
      const grid = document.createElement('div');
      grid.className = 'grid';
      for (const skin of weaponSkins) grid.append(createPickerItem(pickerCategory, skin));
      group.append(grid);
      group.dataset.rendered = 'true';
    };
    group.addEventListener('toggle', () => {
      if (group.open) renderItems();
    });
    if (group.open) renderItems();
    container.append(group);
  }
}

function renderPickerItems() {
  const container = document.getElementById('pickerItems');
  const config = pickerConfigs[pickerCategory];
  const selectedWeapon = config.weaponKey ? builderSelection[config.weaponKey] : null;
  const allowedWeapons = config.filter
    ? resourceData.weapon.filter(config.filter)
    : config.weaponFilter
      ? resourceData.weapon.filter(config.weaponFilter)
      : resourceData.weapon;
  const allowedWeaponNames = new Set(allowedWeapons.map(weapon => weapon.displayName));
  const sourceItems = resourceData[config.dataKey].filter(item => {
    if (config.filter && !config.filter(item)) return false;
    if (config.dataKey === 'skin' && (!allowedWeaponNames.has(item.weaponName) ||
      (selectedWeapon && item.weaponName !== selectedWeapon.displayName))) return false;
    return true;
  });
  const items = sourceItems.filter(item => {
    const searchableText = config.itemType === 'skin'
      ? `${item.displayName} ${item.weaponName}`
      : `${item.displayName} ${getSummary(config.itemType, item)}`;
    return searchableText.toLocaleLowerCase().includes(pickerSearchTerm);
  });
  container.replaceChildren();
  if (config.itemType === 'skin') {
    renderPickerSkinGroups(items, container);
  } else {
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const item of items) grid.append(createPickerItem(pickerCategory, item));
    container.append(grid);
  }
  document.getElementById('pickerStatus').textContent =
    `${items.length.toLocaleString()} ${items.length === 1 ? 'item' : 'items'}`;
  if (items.length === 0) {
    const emptyMessage = document.createElement('p');
    emptyMessage.className = 'empty-results';
    emptyMessage.textContent = 'No items match your search.';
    container.append(emptyMessage);
  }
}

function openPicker(category) {
  const config = pickerConfigs[category];
  if (!config || !resourceData[config.dataKey].length) {
    dataStatus.textContent = 'Game data is not ready yet. Please wait for it to finish loading.';
    return;
  }
  pickerCategory = category;
  pickerSearchTerm = '';
  document.getElementById('pickerTitle').textContent = `Choose ${config.label.replace(/s$/, '')}`;
  document.getElementById('pickerSearchCategory').textContent = config.label;
  document.getElementById('pickerSearch').value = '';
  renderPickerItems();
  pickerDialog.showModal();
  document.getElementById('pickerSearch').focus();
}

function selectBuilderItem(category, item) {
  const config = pickerConfigs[category];
  builderSelection[category] = item;
  if (category.endsWith('Weapon')) {
    const skinKey = category.replace('Weapon', 'Skin');
    const currentSkin = builderSelection[skinKey];
    if (currentSkin?.weaponName !== item.displayName) {
      builderSelection[skinKey] = resourceData.skin.find(skin => skin.weaponName === item.displayName);
    }
  } else if (config.weaponKey) {
    builderSelection[config.weaponKey] = resourceData.weapon.find(weapon => weapon.displayName === item.weaponName);
  }
  updateLoadout();
  pickerDialog.close();
}

function updateSkinTotal() {
  const selectedSkins = ['primarySkin', 'secondarySkin', 'meleeSkin']
    .map(key => builderSelection[key])
    .filter(Boolean);
  const prices = selectedSkins.map(getSkinPrice);
  const priced = prices.filter(Boolean);
  const minimum = priced.reduce((sum, price) => sum + price.min, 0);
  const maximum = priced.reduce((sum, price) => sum + price.max, 0);
  const unpricedCount = prices.length - priced.length;
  const total = document.getElementById('loadoutSkinTotal');
  const note = document.getElementById('loadoutSkinTotalNote');

  total.textContent = priced.length
    ? minimum === maximum
      ? `~ ${formatVp(minimum)}`
      : `~ ${formatVp(minimum)}–${formatVp(maximum)}`
    : 'Unavailable';
  note.textContent = unpricedCount
    ? `Tier-based estimate; melee uses a 2× estimate. ${unpricedCount} selected ${unpricedCount === 1 ? 'skin is' : 'skins are'} unpriced and excluded. The API has no live per-skin store price.`
    : 'Tier-based VP estimate; melee uses 2× pricing and Exclusive skins vary. The API has no live per-skin store price.';
}

function updateLoadout() {
  const agent = builderSelection.agent;
  const primaryWeapon = builderSelection.primaryWeapon;
  const primarySkin = builderSelection.primarySkin;
  const map = builderSelection.map;
  const agentPreview = document.getElementById('agentPreview');
  const agentPortrait = document.getElementById('agentPortrait');
  const agentBackground = document.getElementById('agentBackground');
  const portraitUrl = agent?.fullPortraitV2 || agent?.fullPortrait || agent?.bustPortrait || agent?.displayIcon || '';
  const backgroundUrl = agent?.background || '';
  document.getElementById('agentName').textContent = agent?.displayName || '—';
  agentPreview.dataset.agentName = agent?.displayName || '';
  agentPortrait.hidden = !portraitUrl;
  agentPortrait.src = portraitUrl;
  agentPortrait.alt = agent ? `${agent.displayName} portrait` : '';
  agentBackground.hidden = !backgroundUrl;
  agentBackground.src = backgroundUrl;
  document.getElementById('heroWeaponOut').textContent = primaryWeapon?.displayName || '—';
  document.getElementById('heroSkinOut').textContent = primarySkin?.displayName || 'Weapon Skin';
  document.getElementById('heroMapOut').textContent = map?.displayName || '—';
  document.getElementById('heroRoleOut').textContent = agent?.role.displayName || '—';
  document.getElementById('builderAgent').textContent = agent?.displayName || 'Loadout';
  document.getElementById('builderAgentOut').textContent = agent?.displayName || '—';
  document.getElementById('builderRoleOut').textContent = agent?.role.displayName || '—';
  document.getElementById('builderPrimaryWeaponOut').textContent = primaryWeapon?.displayName || '—';
  document.getElementById('builderPrimarySkinOut').textContent = primarySkin?.displayName || '—';
  document.getElementById('builderSecondaryWeaponOut').textContent = builderSelection.secondaryWeapon?.displayName || '—';
  document.getElementById('builderSecondarySkinOut').textContent = builderSelection.secondarySkin?.displayName || '—';
  document.getElementById('builderMeleeWeaponOut').textContent = builderSelection.meleeWeapon?.displayName || '—';
  document.getElementById('builderMeleeSkinOut').textContent = builderSelection.meleeSkin?.displayName || '—';
  document.getElementById('builderMapOut').textContent = map?.displayName || '—';
  for (const category of Object.keys(pickerConfigs)) updatePickerButton(category);
  updateSkinTotal();
}

function filter(type, button) {
  activeFilter = type;
  document.querySelectorAll('.tabs button').forEach(tab => tab.classList.remove('active'));
  button.classList.add('active');
  renderCards();
}

function show(id, button) {
  document.querySelectorAll('nav button').forEach(tab => tab.classList.remove('active'));
  button.classList.add('active');
  document.getElementById('explorer').style.display = id === 'explorer' ? 'block' : 'none';
  document.getElementById('builder').style.display = id === 'builder' ? 'block' : 'none';
  window.scrollTo(0, 0);
}

async function initialize() {
  dataStatus.textContent = 'Loading Valorant game data…';
  try {
    const [agents, weapons, maps, contentTiers] = await Promise.all([
      fetchResource('agents'),
      fetchResource('weapons'),
      fetchResource('maps'),
      fetchResource('contenttiers')
    ]);
    normalizeData(agents, weapons, maps, contentTiers);
    dataStatus.textContent = 'Valorant game data loaded.';
    renderCards();
    builderSelection.agent = resourceData.agent[0];
    builderSelection.primaryWeapon = resourceData.weapon.find(isPrimaryWeapon);
    builderSelection.primarySkin = resourceData.skin.find(skin => skin.weaponName === builderSelection.primaryWeapon?.displayName);
    builderSelection.secondaryWeapon = resourceData.weapon.find(isSecondaryWeapon);
    builderSelection.secondarySkin = resourceData.skin.find(skin => skin.weaponName === builderSelection.secondaryWeapon?.displayName);
    builderSelection.meleeWeapon = resourceData.weapon.find(isMeleeWeapon);
    builderSelection.meleeSkin = resourceData.skin.find(skin => skin.weaponName === builderSelection.meleeWeapon?.displayName);
    builderSelection.map = resourceData.map[0];
    updateLoadout();
  } catch (error) {
    dataStatus.textContent = `Unable to load Valorant data. ${error.message} Please check your connection and reload.`;
    dataStatus.classList.add('error');
  }
}

document.getElementById('detailClose').addEventListener('click', () => detailDialog.close());
document.getElementById('pickerClose').addEventListener('click', () => pickerDialog.close());
document.getElementById('pickerSearch').addEventListener('input', event => {
  pickerSearchTerm = event.target.value.trim().toLocaleLowerCase();
  renderPickerItems();
});
document.getElementById('explorerSearch').addEventListener('input', event => {
  searchTerm = event.target.value.trim().toLocaleLowerCase();
  if (dataStatus.classList.contains('error')) return;
  renderCards();
});
initialize();
