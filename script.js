const STORAGE_KEY = 'mahjong-games-v1';

const SPECIAL_HAND_RANK = {
  十三幺: 13,
  大四喜: 12,
  九蓮寶燈: 11,
  字一色: 10,
  清么九: 9,
  大三元: 8,
  小四喜: 7,
  四暗刻: 6,
  一色四同順: 5,
  一色四節高: 4,
};

const form = document.getElementById('game-form');
const dateInput = document.getElementById('game-date');
const noteInput = document.getElementById('game-note');
const playersList = document.getElementById('players-list');
const addPlayerButton = document.getElementById('add-player');
const playerTemplate = document.getElementById('player-row-template');
const gamesEmpty = document.getElementById('games-empty');
const gamesTableWrap = document.getElementById('games-table-wrap');
const gamesTableBody = document.querySelector('#games-table tbody');
const yearlyReview = document.getElementById('yearly-review');
const pageTabs = document.querySelectorAll('.page-tab');
const pagePanels = document.querySelectorAll('.page-panel');

let games = loadGames();

init();

function init() {
  dateInput.valueAsDate = new Date();
  resetPlayerRows();
  render();

  wirePageNavigation();
  addPlayerButton.addEventListener('click', () => addPlayerRow());

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    saveGame();
  });

  gamesTableBody.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-delete-id]');
    if (!button) return;
    const id = button.getAttribute('data-delete-id');
    games = games.filter((game) => game.id !== id);
    persistGames();
    render();
  });
}

function wirePageNavigation() {
  pageTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      showPage(tab.dataset.pageTarget);
    });
  });
}

function showPage(pageId) {
  pageTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.pageTarget === pageId);
  });

  pagePanels.forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.page === pageId);
  });
}

function resetPlayerRows() {
  playersList.innerHTML = '';
  for (let index = 0; index < 4; index += 1) {
    addPlayerRow();
  }
}

function addPlayerRow(defaults = {}) {
  const row = playerTemplate.content.firstElementChild.cloneNode(true);
  row.querySelector('.player-name').value = defaults.name || '';
  row.querySelector('.player-score').value = defaults.score ?? '';
  row.querySelector('.player-special').value = defaults.special || '';

  row.querySelector('.remove-row').addEventListener('click', () => {
    if (playersList.children.length > 1) {
      row.remove();
    }
  });

  playersList.appendChild(row);
}

function saveGame() {
  const playerRows = [...playersList.querySelectorAll('.player-row')];
  const players = playerRows
    .map((row) => ({
      name: row.querySelector('.player-name').value.trim(),
      score: Number(row.querySelector('.player-score').value),
      special: row.querySelector('.player-special').value.trim(),
    }))
    .filter((player) => player.name);

  if (players.length < 2) {
    alert('Please enter at least two players.');
    return;
  }

  if (players.some((player) => Number.isNaN(player.score))) {
    alert('Please enter a valid score for each player.');
    return;
  }

  const duplicateNames = new Set();
  const seenNames = new Set();
  players.forEach((player) => {
    const key = player.name.toLowerCase();
    if (seenNames.has(key)) duplicateNames.add(player.name);
    seenNames.add(key);
  });

  if (duplicateNames.size > 0) {
    alert('Duplicate player names found. Please keep one row per player.');
    return;
  }

  const game = {
    id: crypto.randomUUID(),
    date: dateInput.value,
    note: noteInput.value.trim(),
    players,
  };

  games.push(game);
  games.sort((a, b) => a.date.localeCompare(b.date));
  persistGames();

  noteInput.value = '';
  resetPlayerRows();
  render();
  showPage('games-page');
}

function render() {
  renderGamesTable();
  renderYearlyReview();
}

function renderGamesTable() {
  gamesTableBody.innerHTML = '';

  if (games.length === 0) {
    gamesEmpty.classList.remove('hidden');
    gamesTableWrap.classList.add('hidden');
    return;
  }

  gamesEmpty.classList.add('hidden');
  gamesTableWrap.classList.remove('hidden');

  for (const game of games) {
    const row = document.createElement('tr');
    const playersText = game.players.map((player) => `${player.name} (${player.score})`).join(', ');
    const specialText =
      game.players
        .filter((player) => player.special)
        .map((player) => `${player.name}: ${player.special}`)
        .join(' | ') || '—';

    row.innerHTML = `
      <td>${escapeHtml(game.date)}</td>
      <td>${escapeHtml(playersText)}</td>
      <td>${escapeHtml(specialText)}</td>
      <td>${escapeHtml(game.note || '—')}</td>
      <td><button type="button" data-delete-id="${game.id}">Delete</button></td>
    `;

    gamesTableBody.appendChild(row);
  }
}

function renderYearlyReview() {
  yearlyReview.innerHTML = '';

  if (games.length === 0) {
    yearlyReview.innerHTML = '<div class="muted">Add games to generate yearly insights.</div>';
    return;
  }

  const byYear = new Map();

  for (const game of games) {
    const year = new Date(game.date).getFullYear();
    if (!byYear.has(year)) byYear.set(year, new Map());
    const playerStats = byYear.get(year);

    let highestScore = Number.NEGATIVE_INFINITY;
    let lowestScore = Number.POSITIVE_INFINITY;

    game.players.forEach((player) => {
      if (player.score > highestScore) highestScore = player.score;
      if (player.score < lowestScore) lowestScore = player.score;
    });

    for (const player of game.players) {
      if (!playerStats.has(player.name)) {
        playerStats.set(player.name, {
          totalScore: 0,
          gamesPlayed: 0,
          wins: 0,
          losses: 0,
          specialCount: 0,
          specialBreakdown: new Map(),
          maxSingleHand: {
            name: '',
            rank: 0,
          },
        });
      }

      const stats = playerStats.get(player.name);
      const specialHands = parseSpecialHands(player.special);

      stats.totalScore += player.score;
      stats.gamesPlayed += 1;
      stats.specialCount += specialHands.length;

      specialHands.forEach((handName) => {
        const currentCount = stats.specialBreakdown.get(handName) || 0;
        stats.specialBreakdown.set(handName, currentCount + 1);

        const handRank = getSpecialHandRank(handName);
        if (handRank > stats.maxSingleHand.rank) {
          stats.maxSingleHand = {
            name: handName,
            rank: handRank,
          };
        }
      });

      if (player.score === highestScore) stats.wins += 1;
      if (player.score === lowestScore) stats.losses += 1;
    }
  }

  const years = [...byYear.keys()].sort((a, b) => b - a);

  years.forEach((year) => {
    const statsMap = byYear.get(year);
    const statsArray = [...statsMap.entries()].map(([name, stats]) => ({ name, ...stats }));

    const mostMoneyWinTop3 = pickTopPlayers(statsArray, {
      getValue: (stats) => stats.totalScore,
      requirePositive: false,
      formatValue: (value) => String(value),
    });
    const mostLossesTop3 = pickTopPlayers(statsArray, {
      getValue: (stats) => stats.losses,
      requirePositive: true,
      formatValue: (value) => String(value),
    });
    const mostMoneyLoseTop3 = pickBottomPlayers(statsArray, {
      getValue: (stats) => stats.totalScore,
      requireNegative: true,
      formatValue: (value) => String(value),
    });
    const maxSingleHandTop3 = pickTopSpecialHands(statsArray);

    const yearSection = document.createElement('article');
    yearSection.className = 'review-year';

    const title = document.createElement('h3');
    title.textContent = `Year ${year}`;

    const metricsTable = document.createElement('table');
    metricsTable.className = 'metrics-table';
    metricsTable.innerHTML = `
      <thead>
        <tr>
          <th>Metric</th>
          <th>1st</th>
          <th>2nd</th>
          <th>3rd</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>💰 嬴最多錢</td>
          <td>${escapeHtml(mostMoneyWinTop3[0] || '—')}</td>
          <td>${escapeHtml(mostMoneyWinTop3[1] || '—')}</td>
          <td>${escapeHtml(mostMoneyWinTop3[2] || '—')}</td>
        </tr>
        <tr>
          <td>🀄 出統最多次</td>
          <td>${escapeHtml(mostLossesTop3[0] || '—')}</td>
          <td>${escapeHtml(mostLossesTop3[1] || '—')}</td>
          <td>${escapeHtml(mostLossesTop3[2] || '—')}</td>
        </tr>
        <tr>
          <td>📉 輸最多</td>
          <td>${escapeHtml(mostMoneyLoseTop3[0] || '—')}</td>
          <td>${escapeHtml(mostMoneyLoseTop3[1] || '—')}</td>
          <td>${escapeHtml(mostMoneyLoseTop3[2] || '—')}</td>
        </tr>
        <tr>
          <td>✨ 單次嬴最多台</td>
          <td>${escapeHtml(maxSingleHandTop3[0] || '—')}</td>
          <td>${escapeHtml(maxSingleHandTop3[1] || '—')}</td>
          <td>${escapeHtml(maxSingleHandTop3[2] || '—')}</td>
        </tr>
      </tbody>
    `;

    const table = document.createElement('table');
    table.innerHTML = `
      <thead>
        <tr>
          <th>Player</th>
          <th>Games</th>
          <th>Total score</th>
          <th>Wins</th>
          <th>出統次數</th>
          <th>Special hands</th>
          <th>Special detail</th>
        </tr>
      </thead>
      <tbody>
        ${statsArray
          .sort((a, b) => b.totalScore - a.totalScore)
          .map(
            (stats) => `
          <tr>
            <td>${escapeHtml(stats.name)}</td>
            <td>${stats.gamesPlayed}</td>
            <td>${stats.totalScore}</td>
            <td>${stats.wins}</td>
            <td>${stats.losses}</td>
            <td>${stats.specialCount}</td>
            <td>${escapeHtml(formatSpecialBreakdown(stats.specialBreakdown))}</td>
          </tr>
        `,
          )
          .join('')}
      </tbody>
    `;

    yearSection.appendChild(title);
    yearSection.appendChild(metricsTable);
    yearSection.appendChild(table);
    yearlyReview.appendChild(yearSection);
  });
}

function parseSpecialHands(text) {
  return String(text || '')
    .split(/[，,、;；\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatSpecialBreakdown(specialBreakdown) {
  const entries = [...specialBreakdown.entries()].sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return '—';
  return entries.map(([name, count]) => `${name} ×${count}`).join(', ');
}


function getSpecialHandRank(handName) {
  const normalized = String(handName || '').trim();
  return SPECIAL_HAND_RANK[normalized] || 1;
}

function pickTopPlayers(statsArray, options = {}) {
  const { getValue, requirePositive = true, formatValue = (value) => String(value) } = options;
  if (!getValue) return [];

  const ranked = statsArray
    .map((stats) => ({
      name: stats.name,
      value: getValue(stats),
    }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

  if (ranked.length === 0) return [];
  if (requirePositive && ranked[0].value <= 0) return [];

  return ranked.slice(0, 3).map((item) => `${item.name} (${formatValue(item.value)})`);
}


function pickBottomPlayers(statsArray, options = {}) {
  const { getValue, requireNegative = true, formatValue = (value) => String(value) } = options;
  if (!getValue) return [];

  const ranked = statsArray
    .map((stats) => ({
      name: stats.name,
      value: getValue(stats),
    }))
    .sort((a, b) => a.value - b.value || a.name.localeCompare(b.name));

  if (ranked.length === 0) return [];
  if (requireNegative && ranked[0].value >= 0) return [];

  return ranked.slice(0, 3).map((item) => `${item.name} (${formatValue(item.value)})`);
}

function pickTopSpecialHands(statsArray) {
  const ranked = statsArray
    .map((stats) => ({
      name: stats.name,
      hand: stats.maxSingleHand?.name || '',
      rank: stats.maxSingleHand?.rank || 0,
    }))
    .filter((item) => item.hand && item.rank > 0)
    .sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name));

  if (ranked.length === 0) return [];

  return ranked.slice(0, 3).map((item) => `${item.name} (${item.hand})`);
}

function loadGames() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    return data.map((game) => ({
      ...game,
      players: (game.players || []).map((player) => ({
        ...player,
        special: normalizeSpecial(player.special),
      })),
    }));
  } catch {
    return [];
  }
}

function normalizeSpecial(special) {
  if (special === null || special === undefined) return '';
  if (typeof special === 'string') return special.trim();
  if (typeof special === 'number') return special > 0 ? `Special ×${special}` : '';
  return String(special).trim();
}

function persistGames() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
