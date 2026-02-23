export interface VIPMember {
  name: string;
  image?: string;
}

export const DEFAULT_VIP_LIST: VIPMember[] = [
  { name: 'Fion', image: '/VIP/Fion.png' },
  { name: 'Sally', image: '/VIP/Sally.png' },
  { name: 'Eun', image: '/VIP/Eun.png' },
  { name: 'Vennie', image: '/VIP/Vennie.png' },
  { name: 'Jake', image: '/VIP/Jake.png' },
  { name: 'Long²', image: '/VIP/Long².png' },
  { name: 'Kaka', image: '/VIP/Kaka.png' },
];

export const VIP_STORAGE_KEY = 'mahjong-vip-list';

export const loadVIPList = (): VIPMember[] => {
  try {
    const saved = localStorage.getItem(VIP_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load VIP list:', e);
  }
  return DEFAULT_VIP_LIST;
};

export const saveVIPList = (list: VIPMember[]): void => {
  try {
    localStorage.setItem(VIP_STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('Failed to save VIP list:', e);
  }
};
