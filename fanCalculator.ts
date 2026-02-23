
export const FAN_KEYWORDS: Record<string, number> = {
  莊家: 1,
  自摸: 1,
  門清: 1,
  正花: 1,
  正風: 1,
  碰中: 1,
  碰發: 1,
  碰白: 1,
  卡窿: 1,
  中洞: 1,
  邊張: 1,
  搶槓: 1,
  海底撈月: 1,
  河底撈魚: 1,
  三暗刻: 2,
  門清自摸: 3,
  小三元: 4,
  碰碰胡: 4,
  混一色: 4,
  清一色: 8,
  小四喜: 8,
  大三元: 8,
  七搶一: 8,
  地聽: 8,
  天聽: 8,
  Migi: 8,
  四暗刻: 10,
  字一色: 16,
  大四喜: 16,
  十六不搭: 16,
  八仙過海: 16,
  地胡: 16,
  天胡: 24,
};

export interface FanBreakdownItem {
  label: string;
  value: number;
}

export function parseFanFromText(text: string): { items: FanBreakdownItem[]; total: number } {
  if (!text.trim()) return { items: [], total: 0 };

  const items: FanBreakdownItem[] = [];
  const tokens = text
    .split(/[，,、;；\s\n]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  let has門清 = false;
  let has自摸 = false;
  let has門清自摸 = false;
  let diValue = 3; // default 底

  for (const token of tokens) {
    // 底N pattern: 底3=3, 底5=5, etc.
    const diMatch = token.match(/^底(\d+)$/);
    if (diMatch) {
      diValue = parseInt(diMatch[1], 10);
      continue;
    }
    if (token === '底') {
      continue;
    }

    // 連N pattern: 連1=2, 連2=4, 連3=6, etc.
    const lianMatch = token.match(/^連(\d+)$/);
    if (lianMatch) {
      const n = parseInt(lianMatch[1], 10);
      items.push({ label: `連${n}`, value: n * 2 });
      continue;
    }

    if (token === '門清自摸') {
      has門清自摸 = true;
      continue;
    }
    if (token === '門清') {
      has門清 = true;
      continue;
    }
    if (token === '自摸') {
      has自摸 = true;
      continue;
    }

    // Direct keyword lookup
    if (token in FAN_KEYWORDS) {
      items.push({ label: token, value: FAN_KEYWORDS[token] });
    }
  }

  // Always insert 底 as first item
  items.unshift({ label: '底', value: diValue });

  // Handle 門清/自摸 combo
  if (has門清自摸 || (has門清 && has自摸)) {
    items.push({ label: '門清自摸', value: 3 });
  } else {
    if (has門清) items.push({ label: '門清', value: 1 });
    if (has自摸) items.push({ label: '自摸', value: 1 });
  }

  const total = items.reduce((sum, item) => sum + item.value, 0);
  return { items, total };
}
