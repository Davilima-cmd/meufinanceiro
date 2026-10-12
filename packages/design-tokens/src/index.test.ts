import { colors, spacing, borderRadius, typography, shadows, breakpoints, getColors, tokens, type ColorScheme } from './index';

describe('design-tokens', () => {
  describe('colors', () => {
    it('has light and dark color schemes', () => {
      expect(colors.light).toBeDefined();
      expect(colors.dark).toBeDefined();
      expect(colors.light.primary).toBe('#0066CC');
      expect(colors.dark.primary).toBe('#4D9FFF');
    });
  });

  describe('spacing', () => {
    it('has consistent spacing scale', () => {
      expect(spacing.xs).toBe(4);
      expect(spacing.sm).toBe(8);
      expect(spacing.md).toBe(16);
      expect(spacing.lg).toBe(24);
      expect(spacing.xl).toBe(32);
      expect(spacing.xxl).toBe(48);
    });
  });

  describe('borderRadius', () => {
    it('has border radius values', () => {
      expect(borderRadius.sm).toBe(4);
      expect(borderRadius.md).toBe(8);
      expect(borderRadius.lg).toBe(12);
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
    });

    it('has font weights', () => {
      expect(typography.fontWeight.regular).toBe(400);
      expect(typography.fontWeight.bold).toBe(700);
    });
  });

  describe('shadows', () => {
    it('has shadow definitions', () => {
      expect(shadows.sm).toBeDefined();
      expect(shadows.md).toBeDefined();
      expect(shadows.lg).toBeDefined();
    });
  });

  describe('breakpoints', () => {
    it('has responsive breakpoints', () => {
      expect(breakpoints.sm).toBe(640);
      expect(breakpoints.md).toBe(768);
      expect(breakpoints.lg).toBe(1024);
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