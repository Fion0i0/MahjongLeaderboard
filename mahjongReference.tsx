
import React, { useState } from 'react';

export const SPECIAL_HAND_RANK: Record<string, number> = {
  // 16台
  天胡: 16,
  地胡: 16,
  大四喜: 16,
  八仙過海: 16,
  十六不搭: 16,
  // 8台
  天聽: 8,
  地聽: 8,
  七搶一: 8,
  大三元: 8,
  小四喜: 8,
  字一色: 8,
  五暗刻: 8,
  七對子: 8,
  清一色: 8,
  // 5台
  四暗刻: 5,  
};

export const SPECIAL_HANDS_LIST = [
  // 16台
  '天胡', '地胡', '大四喜', '八仙過海', '十六不搭',
  // 8台
  '天聽','地聽', '七搶一', '大三元', '小四喜', '字一色', '五暗刻', '七對子', '清一色',
  // 5台
  '四暗刻',  
];

export const MAHJONG_REFERENCE = [
  // 16台
  { name: '天胡', fan: '16台', desc: '莊家開牌即胡' },
  { name: '地胡', fan: '16台', desc: '閒家摸第一張牌自摸' },
  { name: '大四喜', fan: '16台', desc: '由東、南、西、北四組刻子(或槓子)組成' },
  { name: '八仙過海', fan: '16台', desc: '取得全部8張花牌' },
  { name: '十六不搭', fan: '16台', desc: '起手16張牌，無法組成任何順子、刻子、或搭子' },
  // 8台
  { name: '天聽', fan: '8台', desc: '莊家打出第一張牌後，立即宣告聽牌' },
  { name: '地聽', fan: '8台', desc: '打出第一張牌後，立即宣告聽牌' },
  { name: '七搶一', fan: '8台', desc: '持有7張花牌，加上對手一張' },
  { name: '大三元', fan: '8台', desc: '持有中、發、白三組刻子(或槓子)' },
  { name: '小四喜', fan: '8台', desc: '持有東、南、西、北其中三組刻子及一對眼' },
  { name: '字一色', fan: '8台', desc: '全由字牌組成' },
  { name: '五暗刻', fan: '8台', desc: '持有五組自己摸到的刻子' },
  { name: '七對子', fan: '8台', desc: '由七個對子組成，又稱嚦咕嚦咕' },
  { name: '清一色', fan: '8台', desc: '全由萬、索、筒其中一種花色組成' },
  // 5台
  { name: '四暗刻', fan: '5台', desc: '持有四組自己摸到的刻子' },
  // 4台  
  { name: '小三元', fan: '4台', desc: '持有中、發、白其中兩組刻子及一對眼' },
  { name: '混一色', fan: '4台', desc: '全由字牌及萬、索、筒其中一種花色組成' },
  { name: '碰碰胡', fan: '4台', desc: '全由刻子(或槓子)組成' },
  // 2台
  { name: '三暗刻', fan: '2台', desc: '持有三組自己摸到的刻子' },
  { name: '平胡', fan: '2台', desc: '全由順子組成，沒有刻子、槓子、字牌或花牌' },
  // 1台
  { name: '門清', fan: '1台', desc: '沒有碰、吃、明槓' },
  { name: '不求', fan: '1台', desc: '門清並且自摸' },
  { name: '三元牌', fan: '1台', desc: '持有中、發、白其中刻子' },
  { name: '卡窿/邊張', fan: '1台', desc: '胡順子中間或邊邊的牌' },
  { name: '搶槓', fan: '1台', desc: '胡別人加槓的牌' },
  { name: '槓上', fan: '1台', desc: '胡加槓的牌' },
  { name: '海底撈月', fan: '1台', desc: '胡最後一張牌' },
  { name: '河底撈魚', fan: '1台', desc: '胡別人丟出的最後一張牌' },
  { name: '正花/正風', fan: '1台', desc: '梅蘭竹菊對應位置/圈風門風' },
  { name: '花槓', fan: '1台', desc: '梅蘭竹菊/春夏秋冬各1張' },
  { name: '連莊', fan: '1台', desc: '每連一莊+1台，通常無上限' },
];

export function parseSpecialHands(text: string): string[] {
  return String(text || '')
    .split(/[，,、;；\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getSpecialHandRank(handName: string): number {
  const normalized = String(handName || '').trim();
  return SPECIAL_HAND_RANK[normalized] || 1;
}

export function formatSpecialBreakdown(breakdown: Record<string, number>): string {
  const entries = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return '—';
  return entries.map(([name, count]) => `${name} x${count}`).join(', ');
}

export function SpecialHandPicker({ value, onChange }: {
  value: string;
  onChange: (val: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseSpecialHands(value);

  const countMap: Record<string, number> = {};
  selected.forEach((h) => { countMap[h] = (countMap[h] || 0) + 1; });

  const addOne = (hand: string) => {
    onChange([...selected, hand].join(', '));
  };

  const removeOne = (hand: string) => {
    const idx = selected.lastIndexOf(hand);
    if (idx === -1) return;
    const next = [...selected];
    next.splice(idx, 1);
    onChange(next.join(', '));
  };

  const displayText = Object.entries(countMap)
    .map(([name, count]) => count > 1 ? `${name} x${count}` : name)
    .join(', ');

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full bg-[#0B0E14] border rounded-lg px-3 py-2 text-left text-sm transition-all flex items-center justify-between ${
          open ? 'border-[#3df2bc]' : 'border-[#2A2D33]'
        } ${selected.length > 0 ? 'text-[#FFD700]' : 'text-[#707A8A]'}`}
      >
        <span className="truncate">
          {selected.length > 0 ? displayText : 'Special'}
        </span>
        <i className={`fas fa-chevron-down text-xs ml-1 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-48 right-0 bg-[#1A1D23] border border-[#2A2D33] rounded-xl shadow-2xl py-1 max-h-64 overflow-y-auto">
          {SPECIAL_HANDS_LIST.map((hand) => {
            const count = countMap[hand] || 0;
            return (
              <div
                key={hand}
                className={`w-full px-3 py-2 text-sm flex items-center justify-between hover:bg-[#2A2D33] transition-colors ${
                  count > 0 ? 'text-[#3df2bc]' : 'text-[#E0E6ED]'
                }`}
              >
                <span className="flex-1">{hand}</span>
                <div className="flex items-center gap-2">
                  {count > 0 && (
                    <button
                      type="button"
                      onClick={() => removeOne(hand)}
                      className="w-6 h-6 rounded-full bg-[#2A2D33] hover:bg-[#FF3131]/20 hover:text-[#FF3131] flex items-center justify-center text-xs transition-colors"
                    >
                      <i className="fas fa-minus" />
                    </button>
                  )}
                  {count > 0 && (
                    <span className="text-[#FFD700] font-semibold text-xs w-4 text-center">{count}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => addOne(hand)}
                    className="w-6 h-6 rounded-full bg-[#2A2D33] hover:bg-[#3df2bc]/20 hover:text-[#3df2bc] flex items-center justify-center text-xs transition-colors"
                  >
                    <i className="fas fa-plus" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MahjongReferenceModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-[#1A1D23] border border-[#2A2D33] rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-[#2A2D33]">
          <h2 className="text-lg font-bold text-[#E0E6ED]">台數手冊</h2>
          <button
            onClick={onClose}
            className="text-[#707A8A] hover:text-[#E0E6ED] transition-colors p-1"
          >
            <i className="fas fa-xmark text-lg" />
          </button>
        </div>
        <div className="overflow-y-auto p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2A2D33]">
                <th className="text-left py-2 text-[#707A8A] font-medium">牌型</th>
                <th className="text-center py-2 text-[#707A8A] font-medium">台數</th>
                <th className="text-left py-2 text-[#707A8A] font-medium">說明</th>
              </tr>
            </thead>
            <tbody className="text-[#E0E6ED]">
              {MAHJONG_REFERENCE.map((row) => (
                <tr key={row.name} className="border-b border-[#2A2D33]/50">
                  <td className="py-2 font-medium whitespace-nowrap">{row.name}</td>
                  <td className="py-2 text-center text-[#FFD700] font-semibold whitespace-nowrap">{row.fan}</td>
                  <td className="py-2 text-xs text-[#707A8A]">{row.desc || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
