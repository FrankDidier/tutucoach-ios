import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'tutu_instrument';

export const INSTRUMENTS = [
  {id: 'piano', name: '钢琴'},
  {id: 'violin', name: '小提琴'},
  {id: 'guzheng', name: '古筝'},
  {id: 'erhu', name: '二胡'},
];

let cached = 'piano';

export function currentInstrument() {
  return cached || 'piano';
}

export function instrumentName(id) {
  const hit = INSTRUMENTS.find(x => x.id === (id || cached));
  return hit ? hit.name : '钢琴';
}

export async function loadInstrument() {
  try {
    const v = await AsyncStorage.getItem(KEY);
    if (v && INSTRUMENTS.some(x => x.id === v)) cached = v;
  } catch (e) {}
  return cached;
}

export async function setInstrument(id) {
  const hit = INSTRUMENTS.find(x => x.id === id);
  cached = hit ? hit.id : 'piano';
  try {
    await AsyncStorage.setItem(KEY, cached);
  } catch (e) {}
  return cached;
}
