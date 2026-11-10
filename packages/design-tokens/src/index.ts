export const spacing = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const cornerRadius = {
  small: 4,
  medium: 8,
  large: 16,
  pill: 9999,
} as const;

export const themes = {
  light: {
    canvas: '#f3f6f3',
    surface: '#ffffff',
    text: '#1e2b29',
    muted: '#687572',
    border: '#dfe7e2',
    accent: '#246b61',
    accentSoft: '#e6f1ed',
    positive: '#236b49',
    positiveSoft: '#e8f3ec',
    negative: '#a34043',
  },
  dark: {
    canvas: '#111815',
    surface: '#1a2420',
    text: '#f1f5f2',
    muted: '#a9b5ae',
    border: '#34413b',
    accent: '#81c2ad',
    accentSoft: '#243a32',
    positive: '#9dd4ad',
    positiveSoft: '#21372a',
    negative: '#f2a0a0',
  },
} as const;
