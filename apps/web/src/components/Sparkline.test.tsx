// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Sparkline } from './Sparkline';

describe('Sparkline', () => {
  it('draws a normalised polyline from two or more labelled years', () => {
    const { container } = render(
      <Sparkline
        points={[
          { fy: 'FY2022', value: 0.4 },
          { fy: 'FY2023', value: 0.5 },
          { fy: 'FY2024', value: 0.45 }
        ]}
      />
    );
    const polyline = container.querySelector('polyline');
    expect(polyline).not.toBeNull();
    const coords = polyline?.getAttribute('points') ?? '';
    expect(coords.split(' ')).toHaveLength(3);
    // The minimum sits at the bottom of the box, the maximum at the top.
    expect(coords.startsWith('2.00,26.00')).toBe(true);
    expect(coords).toContain('50.00,2.00');
  });

  it('renders nothing for a single year (data-sufficiency policy)', () => {
    const { container } = render(<Sparkline points={[{ fy: 'FY2024', value: 0.4 }]} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('grounds the line with an area closed to the bottom edge', () => {
    const { container } = render(
      <Sparkline
        points={[
          { fy: 'FY2022', value: 0.4 },
          { fy: 'FY2023', value: 0.5 },
          { fy: 'FY2024', value: 0.45 }
        ]}
      />
    );
    const area = container.querySelector('polygon');
    expect(area).not.toBeNull();
    const coords = area?.getAttribute('points') ?? '';
    expect(coords.startsWith('2.00,28')).toBe(true);
    expect(coords.endsWith('98.00,28')).toBe(true);
    // The line itself sits between the corners, unchanged.
    expect(coords).toContain('50.00,2.00');
  });

  it('wears the health signal as its colour class, neutral without one', () => {
    const points = [
      { fy: 'FY2023', value: 0.4 },
      { fy: 'FY2024', value: 0.5 }
    ] as const;
    const neutral = render(<Sparkline points={points} />);
    expect(neutral.container.querySelector('svg')?.getAttribute('class')).toContain('spark');
    expect(neutral.container.querySelector('svg')?.getAttribute('class')).not.toContain('Healthy');

    const healthy = render(<Sparkline points={points} health="healthy" />);
    expect(healthy.container.querySelector('svg')?.getAttribute('class')).toContain('sparkHealthy');

    const investigate = render(<Sparkline points={points} health="investigate" />);
    expect(investigate.container.querySelector('svg')?.getAttribute('class')).toContain(
      'sparkInvestigate'
    );
  });

  it('draws a centre line for a flat series instead of dividing by zero', () => {
    const { container } = render(
      <Sparkline
        points={[
          { fy: 'FY2023', value: 0.4 },
          { fy: 'FY2024', value: 0.4 }
        ]}
      />
    );
    const coords = container.querySelector('polyline')?.getAttribute('points') ?? '';
    expect(coords).toBe('2.00,14.00 98.00,14.00');
  });
});
