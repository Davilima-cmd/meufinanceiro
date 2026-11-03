import {
  colors,
  spacing,
  borderRadius,
  typography,
  shadows,
  breakpoints,
  zIndex,
  transitions,
  getColors,
  tokens,
  type ColorScheme,
} from './index';

describe('design-tokens', () => {
  describe('colors', () => {
    it('has light and dark color schemes', () => {
      expect(colors.light).toBeDefined();
      expect(colors.dark).toBeDefined();
      expect(colors.light.primary).toBe('#0066CC');
      expect(colors.dark.primary).toBe('#4D9FFF');
    });

    it('has semantic colors for finance', () => {
      expect(colors.light.income).toBe('#1E7E34');
      expect(colors.light.expense).toBe('#C62828');
      expect(colors.light.transfer).toBe('#0066CC');
      expect(colors.light.investment).toBe('#6F42C1');
      expect(colors.dark.income).toBe('#69DB7C');
      expect(colors.dark.expense).toBe('#FF6B6B');
      expect(colors.dark.transfer).toBe('#4D9FFF');
      expect(colors.dark.investment).toBe('#BB86FC');
    });

    it('has extended neutral colors', () => {
      expect(colors.light.surfaceHover).toBe('#EEF1F4');
      expect(colors.light.surfacePressed).toBe('#DEE2E6');
      expect(colors.light.borderStrong).toBe('#ADB5BD');
      expect(colors.dark.surfaceHover).toBe('#2A2A2A');
      expect(colors.dark.surfacePressed).toBe('#333333');
      expect(colors.dark.borderStrong).toBe('#4A4A4A');
    });
  });

  describe('spacing', () => {
    it('has consistent spacing scale', () => {
      expect(spacing['0']).toBe(0);
      expect(spacing.xs).toBe(4);
      expect(spacing.sm).toBe(8);
      expect(spacing.md).toBe(16);
      expect(spacing.lg).toBe(24);
      expect(spacing.xl).toBe(32);
      expect(spacing.xxl).toBe(48);
      expect(spacing.xxxl).toBe(64);
    });
  });

  describe('borderRadius', () => {
    it('has border radius values', () => {
      expect(borderRadius.none).toBe(0);
      expect(borderRadius.sm).toBe(4);
      expect(borderRadius.md).toBe(8);
      expect(borderRadius.lg).toBe(12);
      expect(borderRadius.xl).toBe(16);
      expect(borderRadius.full).toBe(9999);
    });
  });

  describe('typography', () => {
    it('has font families', () => {
      expect(typography.fontFamily.sans).toContain('Inter');
      expect(typography.fontFamily.mono).toContain('JetBrains Mono');
    });

    it('has font sizes', () => {
      expect(typography.fontSize.xs).toBe(12);
      expect(typography.fontSize.md).toBe(16);
      expect(typography.fontSize.xl).toBe(24);
      expect(typography.fontSize.xxxl).toBe(40);
    });

    it('has font weights', () => {
      expect(typography.fontWeight.regular).toBe(400);
      expect(typography.fontWeight.bold).toBe(700);
    });

    it('has letter spacing', () => {
      expect(typography.letterSpacing.tight).toBe('-0.02em');
      expect(typography.letterSpacing.normal).toBe('0');
      expect(typography.letterSpacing.wide).toBe('0.02em');
    });
  });

  describe('shadows', () => {
    it('has shadow definitions', () => {
      expect(shadows.none).toBe('none');
      expect(shadows.xs).toBeDefined();
      expect(shadows.sm).toBeDefined();
      expect(shadows.md).toBeDefined();
      expect(shadows.lg).toBeDefined();
      expect(shadows.xl).toBeDefined();
      expect(shadows.inner).toBeDefined();
    });
  });

  describe('breakpoints', () => {
    it('has responsive breakpoints', () => {
      expect(breakpoints.sm).toBe(640);
      expect(breakpoints.md).toBe(768);
      expect(breakpoints.lg).toBe(1024);
    });
  });

  describe('zIndex', () => {
    it('has z-index scale', () => {
      expect(zIndex.hide).toBe(-1);
      expect(zIndex.base).toBe(0);
      expect(zIndex.dropdown).toBe(1000);
      expect(zIndex.modal).toBe(1300);
      expect(zIndex.toast).toBe(1700);
    });
  });

  describe('transitions', () => {
    it('has transition durations', () => {
      expect(transitions.fast).toBe('150ms ease');
      expect(transitions.normal).toBe('200ms ease');
      expect(transitions.slow).toBe('300ms ease');
    });
  });

  describe('getColors', () => {
    it('returns light colors by default', () => {
      const c = getColors();
      expect(c.primary).toBe('#0066CC');
    });

    it('returns dark colors when specified', () => {
      const c = getColors('dark');
      expect(c.primary).toBe('#4D9FFF');
    });

    it('returns light colors when explicitly requested', () => {
      const c = getColors('light');
      expect(c.primary).toBe('#0066CC');
    });
  });

  describe('tokens', () => {
    it('exports all tokens', () => {
      expect(tokens.colors).toBe(colors);
      expect(tokens.spacing).toBe(spacing);
      expect(tokens.borderRadius).toBe(borderRadius);
      expect(tokens.typography).toBe(typography);
      expect(tokens.shadows).toBe(shadows);
      expect(tokens.breakpoints).toBe(breakpoints);
      expect(tokens.zIndex).toBe(zIndex);
      expect(tokens.transitions).toBe(transitions);
      expect(tokens.getColors).toBe(getColors);
    });
  });

  describe('ColorScheme type', () => {
    it('accepts light and dark', () => {
      const light: ColorScheme = 'light';
      const dark: ColorScheme = 'dark';
      expect(light).toBe('light');
      expect(dark).toBe('dark');
    });
  });
});
