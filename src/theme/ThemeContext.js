// 主题上下文：全局提供当前配色（浅/暗）并支持运行时「切换主题」。
// 选择持久化到本地（key=theme_mode），冷启动时读取。
import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import {getItem, setItem} from '../services/storage';
import {colorsForMode} from './themes';

const STORAGE_KEY = 'theme_mode';
// 默认走新「黑紫色」暗色主题（客户指定的主视觉）；可通过「切换主题」切到浅色。
const DEFAULT_MODE = 'dark';

const ThemeContext = createContext({
  mode: DEFAULT_MODE,
  colors: colorsForMode(DEFAULT_MODE),
  setMode: () => {},
  toggle: () => {},
  ready: false,
});

export function ThemeProvider({children}) {
  const [mode, setModeState] = useState(DEFAULT_MODE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const saved = await getItem(STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') setModeState(saved);
      setReady(true);
    })();
  }, []);

  const setMode = useCallback(m => {
    const next = m === 'dark' ? 'dark' : 'light';
    setModeState(next);
    setItem(STORAGE_KEY, next);
  }, []);

  const toggle = useCallback(() => {
    setModeState(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({mode, colors: colorsForMode(mode), setMode, toggle, ready}),
    [mode, setMode, toggle, ready],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

export default ThemeContext;
