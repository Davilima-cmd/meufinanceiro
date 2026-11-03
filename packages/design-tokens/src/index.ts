/**
 * Design tokens for Meu Financeiro
 * Complete design system tokens for Phase 1
 */

export const colors = {
  light: {
    // Primary brand colors
    primary: '#0066CC',
    primaryHover: '#0052A3',
    primaryActive: '#004080',
    primaryLight: '#E6F0FA',
    primaryDark: '#003D99',

    // Semantic colors
    success: '#1E7E34',
    successLight: '#E8F5E9',
    successDark: '#155D27',
    warning: '#B8860B',
    warningLight: '#FFF8E1',
    warningDark: '#8A6D00',
    danger: '#C62828',
    dangerLight: '#FDEDEC',
    dangerDark: '#8B1A1A',
    info: '#0066CC',
    infoLight: '#E6F0FA',
    infoDark: '#003D99',

    // Neutral colors
    background: '#FFFFFF',
    surface: '#F8F9FA',
    surfaceHover: '#EEF1F4',
    surfacePressed: '#DEE2E6',
    border: '#DEE2E6',
    borderStrong: '#ADB5BD',
    divider: '#E9ECEF',

    // Text colors
    text: '#212529',
    textSecondary: '#495057',
    textMuted: '#6C757D',
    textDisabled: '#ADB5BD',
    textInverse: '#FFFFFF',
    textOnPrimary: '#FFFFFF',

    // Status colors for finance
    income: '#1E7E34',
    incomeLight: '#E8F5E9',
    expense: '#C62828',
    expenseLight: '#FDEDEC',
    transfer: '#0066CC',
    transferLight: '#E6F0FA',
    investment: '#6F42C1',
    investmentLight: '#F3E8FF',

    // Overlay
    overlay: 'rgba(0, 0, 0, 0.5)',
    overlayLight: 'rgba(0, 0, 0, 0.3)',
  },
  dark: {
    // Primary brand colors
    primary: '#4D9FFF',
    primaryHover: '#6EB0FF',
    primaryActive: '#3399FF',
    primaryLight: '#1A3A5C',
    primaryDark: '#0066CC',

    // Semantic colors
    success: '#69DB7C',
    successLight: '#1B3A1B',
    successDark: '#4CAF50',
    warning: '#FFD63D',
    warningLight: '#3D3300',
    warningDark: '#FFC107',
    danger: '#FF6B6B',
    dangerLight: '#3D1A1A',
    dangerDark: '#EF5350',
    info: '#4D9FFF',
    infoLight: '#1A3A5C',
    infoDark: '#6EB0FF',

    // Neutral colors
    background: '#121212',
    surface: '#1E1E1E',
    surfaceHover: '#2A2A2A',
    surfacePressed: '#333333',
    border: '#333333',
    borderStrong: '#4A4A4A',
    divider: '#2A2A2A',

    // Text colors
    text: '#E0E0E0',
    textSecondary: '#B0B0B0',
    textMuted: '#888888',
    textDisabled: '#666666',
    textInverse: '#121212',
    textOnPrimary: '#121212',

    // Status colors for finance
    income: '#69DB7C',
    incomeLight: '#1B3A1B',
    expense: '#FF6B6B',
    expenseLight: '#3D1A1A',
    transfer: '#4D9FFF',
    transferLight: '#1A3A5C',
    investment: '#BB86FC',
    investmentLight: '#2D1B4D',

    // Overlay
    overlay: 'rgba(0, 0, 0, 0.7)',
    overlayLight: 'rgba(0, 0, 0, 0.5)',
  },
};

export const spacing = {
  '0': 0,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
};

export const borderRadius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

export const typography = {
  fontFamily: {
    sans: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    mono: 'JetBrains Mono, Fira Code, Consolas, monospace',
  },
  fontSize: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 24,
    xxl: 32,
    xxxl: 40,
  },
  fontWeight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
  letterSpacing: {
    tight: '-0.02em',
    normal: '0',
    wide: '0.02em',
  },
};

export const shadows = {
  none: 'none',
  xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  sm: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
  inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)',
};

export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  xxl: 1536,
};

export const zIndex = {
  hide: -1,
  base: 0,
  dropdown: 1000,
  sticky: 1100,
  modal: 1300,
  popover: 1400,
  tooltip: 1500,
  toast: 1700,
};

export const transitions = {
  fast: '150ms ease',
  normal: '200ms ease',
  slow: '300ms ease',
};

export type ColorScheme = 'light' | 'dark';

export function getColors(scheme: ColorScheme = 'light') {
  return colors[scheme];
}

export const tokens = {
  colors,
  spacing,
  borderRadius,
  typography,
  shadows,
  breakpoints,
  zIndex,
  transitions,
  getColors,
};

export default tokens;
