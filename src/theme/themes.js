// 主题令牌（浅色=原粉色主题；暗色=新「黑紫色」主题，源自蓝湖设计稿）。
// 约定：所有页面通过 useTheme() 拿到语义色（bg/card/primary/text...），
// 这样「切换主题」开关即可整体换肤；组件内的样式请用 makeStyles(colors) 生成。
//
// 兼容说明：老的粉色键（pinkPrimary 等）仍保留在 light 里，未迁移的页面继续
// import {Colors} from '../utils/colors' 使用浅色，逐页迁移到 useTheme。

const common = {
  white: '#FFFFFF',
  black: '#000000',
  orangeAccent: '#FF9A56',
  orangeLight: '#FFF0E5',
  gold: '#FFD54F',
  danger: '#FF5A7F',
  success: '#4CD08A',
};

export const lightColors = {
  ...common,
  mode: 'light',
  statusBarStyle: 'dark-content',

  // 背景
  bg: '#FFF5F7',
  bgGradientTop: '#FFE8EE',
  bgGradientBottom: '#FFF5F7',

  // 卡片 / 表面
  card: '#FFFFFF',
  cardAlt: '#FFF0F3',
  cardBorder: '#F0DCE2',
  inputBg: '#F7F7F7',

  // 主色（粉）
  primary: '#FF5A7F',
  primaryDark: '#E8456A',
  primaryGradientStart: '#FF6B8A',
  primaryGradientEnd: '#FF8FA0',
  onPrimary: '#FFFFFF',
  accent: '#FF5A7F',

  // 文字
  textPrimary: '#191919',
  textSecondary: '#7A7A86',
  textMuted: '#A6A6A6',

  // 分隔线 / tab
  divider: '#E5E5E5',
  tabBarBg: '#FFFFFF',
  tabActive: '#F03B61',
  tabInactive: '#D9B4C0',

  // 蓝色辅助（历史）
  blueBrand: '#01AFF5',
  blueSoft: '#75ADF8',
};

export const darkColors = {
  ...common,
  mode: 'dark',
  statusBarStyle: 'light-content',

  // 背景：近黑的深靛蓝，顶部带紫色辉光
  bg: '#0B0718',
  bgGradientTop: '#241A46',
  bgGradientBottom: '#070410',

  // 卡片 / 表面：深紫黑
  card: '#161130',
  cardAlt: '#1E1846',
  cardBorder: 'rgba(255,255,255,0.07)',
  inputBg: '#181334',

  // 主色（亮紫渐变）
  primary: '#8B5CF6',
  primaryDark: '#6D3EE6',
  primaryGradientStart: '#B49BFF',
  primaryGradientEnd: '#7C5CFF',
  onPrimary: '#FFFFFF',
  accent: '#A98BFF',

  // 文字
  textPrimary: '#FFFFFF',
  textSecondary: '#9A93B8',
  textMuted: '#6E688A',

  // 分隔线 / tab
  divider: 'rgba(255,255,255,0.08)',
  tabBarBg: '#0C0820',
  tabActive: '#B595FF',
  tabInactive: '#5D4F7E',

  // 蓝色辅助（历史）
  blueBrand: '#4DA6FF',
  blueSoft: '#75ADF8',
};

export const THEMES = {light: lightColors, dark: darkColors};

export function colorsForMode(mode) {
  return mode === 'dark' ? darkColors : lightColors;
}
