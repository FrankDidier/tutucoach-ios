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

  // 背景（蓝湖 t2）
  bg: '#FAFAFA',
  bgGradientTop: '#FFE5EC',
  bgGradientBottom: '#FAFAFA',

  // 卡片 / 表面
  card: '#FFFFFF',
  cardAlt: '#FFF0F3',
  cardBorder: '#F0DCE2',
  inputBg: '#F7F7F7',

  // 主色（粉）— CTA 竖向 #FF7A9A→#FF355F（蓝湖会员/确认按钮）
  primary: '#FF355F',
  primaryDark: '#FF3761',
  primaryGradientStart: '#FF7A9A',
  primaryGradientEnd: '#FF355F',
  onPrimary: '#FFFFFF',
  accent: '#FF5F83',

  // 文字（蓝湖正文 #261216）
  textPrimary: '#261216',
  textSecondary: '#979797',
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

  // 背景（蓝湖 t1 页底 #020014）
  bg: '#020014',
  bgGradientTop: '#241A46',
  bgGradientBottom: '#020014',

  // 卡片 / 表面
  card: '#040428',
  cardAlt: '#131444',
  cardBorder: 'rgba(255,255,255,0.07)',
  inputBg: '#131444',

  // 主色（紫）— CTA #7F47FE→#503CFA；Tab/选中 #B595FF
  primary: '#7F47FE',
  primaryDark: '#503CFA',
  primaryGradientStart: '#B595FF',
  primaryGradientEnd: '#7F47FE',
  onPrimary: '#FFFFFF',
  accent: '#B595FF',

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
