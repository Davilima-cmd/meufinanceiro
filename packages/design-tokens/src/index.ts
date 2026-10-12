/**
 * Design tokens for Meu Financeiro
 * Placeholder values - real design tokens will be defined in Phase 1
 */

export const colors = {
  light: {
    primary: '#0066CC',
    primaryHover: '#0052A3',
    secondary: '#6C757D',
    success: '#28A745',
    warning: '#FFC107',
    danger: '#DC3545',
    background: '#FFFFFF',
    surface: '#F8F9FA',
    border: '#DEE2E6',
    text: '#212529',
    textMuted: '#6C757D',
  },
  dark: {
    primary: '#4D9FFF',
    primaryHover: '#6EB0FF',
    secondary: '#ADB5BD',
    success: '#69DB7C',
    warning: '#FFD63D',
    danger: '#FF6B6B',
    background: '#121212',
    surface: '#1E1E1E',
    border: '#333333',
    text: '#E0E0E0',
    textMuted: '#ADB5BD',
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
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
};

export const shadows = {
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
};

export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  xxl: 1536,
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
  getColors,
};

export default tokens;
